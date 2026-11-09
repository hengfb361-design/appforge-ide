# -*- coding: utf-8 -*-
"""Local-model version of Buffy AI.

Serves the same ChatGPT-style UI (ui.py) but answers with a GGUF model that runs
locally through an OpenAI-compatible server (Ollama by default, llama.cpp also
works) — no cloud API key needed.

The Colab notebook starts the engine, imports the GGUF, then runs this app:

    ollama serve                                    # http://127.0.0.1:11434
    LLAMA_URL=http://127.0.0.1:11434 LOCAL_MODEL=buffy-coder \
        uvicorn local_app:app --host 127.0.0.1 --port 8000

Environment:
    LLAMA_URL    OpenAI-compatible base URL (default http://127.0.0.1:11434)
    LOCAL_MODEL  model name inside that engine (default "buffy-coder")

    API_BASE_URL OpenAI-compatible *hosted* API, e.g. https://api.example.com/v1
    API_KEY      bearer key for that API — set it in Sites → Secrets / env,
                 never in the browser or the source code
    API_MODEL    model id for that API (falls back to LOCAL_MODEL)
    ACCESS_KEY   key the Colab notebook prints; when set, calls from another
                 origin (the public website) must send it as a bearer token

When API_BASE_URL is set the app calls that hosted API; otherwise it uses the
local engine at LLAMA_URL. The key is only ever read from the environment on
the server, so the public page never receives it.
"""

import base64
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
import traceback
import zipfile
from urllib.parse import quote_plus, urlparse

import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (HTMLResponse, JSONResponse, StreamingResponse,
                               Response)
from pydantic import BaseModel
from typing import List

from ui import PAGE
from ide_store import router as ide_router

LLAMA_URL = os.environ.get("LLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
LOCAL_MODEL = os.environ.get("LOCAL_MODEL", "buffy-coder")

# Optional hosted OpenAI-compatible API. The key lives only in the server
# environment (Sites → Secrets / process env) and is never sent to the browser.
API_BASE_URL = os.environ.get("API_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("API_KEY", "").strip()
API_MODEL = os.environ.get("API_MODEL", "").strip()

# Access key printed by the Colab notebook. When set, calls that come from
# another origin (e.g. the public website on Render) must send it as
# "Authorization: Bearer <key>". Same-origin calls — the page this app serves —
# are already protected by the tunnel URL itself and keep working.
ACCESS_KEY = os.environ.get("ACCESS_KEY", "").strip()

# Optional image generation: ComfyUI runs beside this app (Kaggle / Colab) and
# serves Qwen-Image. The browser only ever talks to this server, so ComfyUI
# never needs CORS or a public port of its own.
IMAGE_BASE_URL = os.environ.get("IMAGE_BASE_URL", "").rstrip("/")
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "qwen_image_fp8_hq.safetensors")
IMAGE_CLIP = os.environ.get("IMAGE_CLIP", "qwen_2.5_vl_7b_fp8_scaled.safetensors")
IMAGE_VAE = os.environ.get("IMAGE_VAE", "qwen_image_vae.safetensors")
# Qwen-Image 2.1 is a different graph: it conditions through
# TextEncodeQwenImage21 (Qwen3-VL encoder) and is published for cfg 1, while
# 1.0 uses plain CLIPTextEncode at cfg 2.5. Detected from the checkpoint name.
IMAGE_FAMILY = "qwen_image21" if "2.1" in IMAGE_MODEL else "qwen_image"
# Qwen-Image 2.1 turbo checkpoints are distilled for one fixed 8-step noise
# schedule, which the official template pins inside a ManualSigmas node. A
# plain KSampler with 8 steps would come out soft, so turbo gets its own graph.
IMAGE_TURBO = "turbo" in IMAGE_MODEL.lower()
TURBO_SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"
IMAGE_STEPS = int(os.environ.get("IMAGE_STEPS", "20"))
IMAGE_TIMEOUT = int(os.environ.get("IMAGE_TIMEOUT", "900"))

# Optional image→video. LTX-Video 2B runs in the same ComfyUI; the checkpoint
# carries MODEL+VAE and a separate T5 encoder is loaded with CLIPLoader. An
# empty VIDEO_MODEL means the feature is off (no weights on disk) and the
# browser hides the button.
VIDEO_MODEL = os.environ.get("VIDEO_MODEL", "").strip()
VIDEO_CLIP = os.environ.get("VIDEO_CLIP", "t5xxl_fp8_e4m3fn_scaled.safetensors").strip()
VIDEO_FPS = int(os.environ.get("VIDEO_FPS", "24"))
VIDEO_FRAMES = int(os.environ.get("VIDEO_FRAMES", "121"))
VIDEO_WIDTH = int(os.environ.get("VIDEO_WIDTH", "768"))
VIDEO_HEIGHT = int(os.environ.get("VIDEO_HEIGHT", "512"))
VIDEO_STEPS = int(os.environ.get("VIDEO_STEPS", "30"))
VIDEO_CFG = float(os.environ.get("VIDEO_CFG", "3.0"))
VIDEO_STRENGTH = float(os.environ.get("VIDEO_STRENGTH", "0.15"))
# 121 frames ≈ 5s at 24fps. 257 frames ≈ 10.7s is allowed by the node but needs
# far more VRAM, so generate_video halves the length once if ComfyUI runs out.
VIDEO_TIMEOUT = int(os.environ.get("VIDEO_TIMEOUT", "2400"))

# Optional web search for source citations (Exa). Read from the server
# environment only — the browser never receives it.
EXA_API_KEY = os.environ.get("EXA_API_KEY", "").strip()
# Overridable so the endpoint can be pointed at a mock in tests.
EXA_SEARCH_URL = os.environ.get("EXA_SEARCH_URL", "https://api.exa.ai/search")
SEARCH_TOP_N = 5


def _normalize_base(url: str) -> str:
    """Strip trailing slash and a trailing /v1 so the caller can append
    "/v1/chat/completions" exactly once. Users often paste the URL with /v1
    (e.g. https://openrouter.ai/api/v1); without it the request would 404."""
    url = (url or "").rstrip("/")
    if url.endswith("/v1"):
        url = url[: -len("/v1")].rstrip("/")
    return url


def backend():
    """(base_url, model, headers) for the engine that is currently configured."""
    if API_BASE_URL:
        headers = {"Content-Type": "application/json"}
        if API_KEY:
            headers["Authorization"] = "Bearer " + API_KEY
        return _normalize_base(API_BASE_URL), API_MODEL or LOCAL_MODEL, headers
    return LLAMA_URL, LOCAL_MODEL, {}


def mode() -> str:
    return "hosted API" if API_BASE_URL else "local"


def search_web(query: str):
    """Return (sources, notes).

    sources is a list of {title, url} for the UI's citation chips;
    notes is a short human-readable status line. Never raises.
    """
    if not EXA_API_KEY:
        return [], ("Web search ត្រូវការ EXA_API_KEY — ដាក់ក្នុង Sites → Secrets សិន។")
    try:
        resp = requests.post(
            EXA_SEARCH_URL,
            headers={
                "Authorization": "Bearer " + EXA_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "type": "auto",
                "numResults": SEARCH_TOP_N,
                "contents": {"highlights": True},
            },
            timeout=(5, 20),
        )
        if resp.status_code != 200:
            return [], ("Web search បរាជ័យ (HTTP %s)" % resp.status_code)
        results = resp.json().get("results") or []
        sources, notes = [], []
        for item in results[:SEARCH_TOP_N]:
            title = (item.get("title") or "").strip()
            url = (item.get("url") or "").strip()
            if not url:
                continue
            sources.append({"title": title or url, "url": url})
            highlights = item.get("highlights") or []
            snippet = (highlights[0] if highlights else "").strip()
            notes.append("%s\n  URL: %s\n  %s" % (title, url, snippet[:400]))
        return sources, notes
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return [], ("Web search មិនអាចភ្ជាប់បានទេ: %s" % str(exc)[:120])


def with_web_context(message: str, notes) -> str:
    """Prepend search results so the model can cite them."""
    if not notes:
        return message
    block = "\n\n".join(notes)
    return (
        "[Web search results — use them only when relevant, and cite the source "
        "by name and link. Ignore them if they do not answer the question.]\n\n"
        + block
        + "\n\n---\n\nQuestion:\n"
        + message
    )

SYSTEM_INSTRUCTION = (
    "You are a helpful AI assistant running locally on the user's machine. "
    "Always answer in the same language the user writes in (Khmer, English, or any other) — "
    "for Khmer questions, reply in Khmer. "
    "Answer the question as asked: be helpful, comply with the request, and stay concise; "
    "only refuse when a request is clearly illegal or genuinely harmful, and when you do, "
    "say so briefly and offer a safe alternative. Do not lecture the user about safety for "
    "ordinary creative, technical or educational questions. "
    "Use Markdown lists, tables and fenced code blocks with language tags when they help. "
    "Never invent facts — if you are unsure, say so."
)

app = FastAPI(title="Buffy AI (local)")
# The IDE's project storage: create/read/write/move/delete, ZIP in-out and the
# sandboxed preview route. Mounted here so / and /api live on one service.
app.include_router(ide_router)

# AppForge (the Android app builder in app-forge/public) is plain static files,
# so it rides on this service instead of needing a second Render deploy.
# https://buffy-ai.onrender.com/appforge/
_APPFORGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "app-forge", "public")
if os.path.isdir(_APPFORGE_DIR):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import HTMLResponse
    from fastapi import HTTPException

    _IDE_DIR = os.path.join(_APPFORGE_DIR, "ide")
    _IDE_INDEX = os.path.join(_IDE_DIR, "index.html")

    def _ide_asset_stamp() -> str:
        """Newest mtime of the IDE assets, so every deploy changes the URLs.

        Without it a phone keeps the old ide.js from its cache and the page
        looks unchanged long after a deploy (the static mount sends no
        Cache-Control).
        """
        stamp = 0
        for rel in ("ide.js", "ide.css", "editor.js", os.path.join("..", "gen.js")):
            try:
                stamp = max(stamp, int(os.path.getmtime(os.path.join(_IDE_DIR, rel))))
            except OSError:
                pass
        return str(stamp)

    # Registered before the static mount so it wins for the IDE page: the HTML
    # is never cached and points at versioned assets.
    @app.get("/appforge/ide/", include_in_schema=False)
    @app.get("/appforge/ide/index.html", include_in_schema=False)
    def ide_index_page():
        try:
            with open(_IDE_INDEX, encoding="utf-8") as fh:
                page = fh.read()
        except OSError:
            raise HTTPException(status_code=404, detail="IDE page missing")
        v = _ide_asset_stamp()
        for asset in ("./ide.css", "../gen.js", "./editor.js", "./ide.js"):
            page = page.replace('"' + asset + '"', '"' + asset + "?v=" + v + '"')
        return HTMLResponse(page, headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        })

    app.mount("/appforge", StaticFiles(directory=_APPFORGE_DIR, html=True),
              name="appforge")

# The website on another origin calls this server straight from the browser,
# so allow cross-origin requests. No cookies are used (the key travels in a
# header), which is why "*" is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    max_age=600,
)


def _same_origin(request: Request) -> bool:
    """True for the page this app serves (or for server-side callers such as
    the notebook's health check, which send no Origin header)."""
    origin = request.headers.get("origin") or ""
    host = request.headers.get("host") or ""
    if not origin or not host:
        return True
    return urlparse(origin).netloc == host


def _key_ok(request: Request) -> bool:
    supplied = (request.headers.get("x-api-key") or "").strip()
    auth = request.headers.get("authorization") or ""
    if not supplied and auth.lower().startswith("bearer "):
        supplied = auth[7:].strip()
    return bool(supplied) and hmac.compare_digest(supplied, ACCESS_KEY)


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        {"detail": "API key មិនត្រឹមត្រូវ — paste key ដែល Colab បង្ហាញក្នុង sidebar។"},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _workflow(prompt: str, negative: str, width: int, height: int, seed: int,
              steps: int = 0) -> dict:
    """Minimal Qwen-Image text-to-image graph for ComfyUI's /prompt API."""
    steps = steps or IMAGE_STEPS
    if IMAGE_FAMILY == "qwen_image21":
        # Matches ComfyUI's official Qwen-Image 2.1 text-to-image template.
        # At cfg 1 the sampler skips the negative pass, so no extra cost.
        wf = {
            "1": {"class_type": "UNETLoader",
                  "inputs": {"unet_name": IMAGE_MODEL, "weight_dtype": "default"}},
            "2": {"class_type": "CLIPLoader",
                  "inputs": {"clip_name": IMAGE_CLIP, "type": "qwen_image"}},
            "3": {"class_type": "VAELoader", "inputs": {"vae_name": IMAGE_VAE}},
            "4": {"class_type": "TextEncodeQwenImage21",
                  "inputs": {"clip": ["2", 0], "prompt": prompt,
                             "negative_prompt": negative,
                             "resolution": max(width, height)}},
            "6": {"class_type": "EmptyLatentImage",
                  "inputs": {"width": width, "height": height, "batch_size": 1}},
        }
        if IMAGE_TURBO:
            # Turbo LoRA/checkpoint graph: the 8-step schedule lives in
            # ManualSigmas, so the sampler is CustomAdvanced and `steps` is
            # ignored on purpose — that schedule is what makes 8 steps work.
            wf.update({
                "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
                "11": {"class_type": "CFGGuider",
                       "inputs": {"model": ["1", 0], "positive": ["4", 0],
                                  "negative": ["4", 1], "cfg": 1.0}},
                "12": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
                "13": {"class_type": "ManualSigmas", "inputs": {"sigmas": TURBO_SIGMAS}},
                "14": {"class_type": "SamplerCustomAdvanced",
                       "inputs": {"noise": ["10", 0], "guider": ["11", 0],
                                  "sampler": ["12", 0], "sigmas": ["13", 0],
                                  "latent_image": ["6", 0]}},
                "8": {"class_type": "VAEDecode",
                      "inputs": {"samples": ["14", 0], "vae": ["3", 0]}},
            })
        else:
            wf.update({
                "7": {"class_type": "KSampler",
                       "inputs": {"model": ["1", 0], "positive": ["4", 0],
                                  "negative": ["4", 1], "latent_image": ["6", 0],
                                  "seed": seed, "steps": steps, "cfg": 1.0,
                                  "sampler_name": "euler", "scheduler": "simple",
                                  "denoise": 1.0}},
                "8": {"class_type": "VAEDecode",
                      "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
            })
        wf["9"] = {"class_type": "SaveImage",
                   "inputs": {"images": ["8", 0], "filename_prefix": "buffy"}}
        return wf
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": IMAGE_MODEL, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": IMAGE_CLIP, "type": "qwen_image"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": IMAGE_VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative, "clip": ["2", 0]}},
        "6": {"class_type": "EmptySD3LatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0],
                         "latent_image": ["6", 0], "seed": seed, "steps": steps,
                         "cfg": 2.5, "sampler_name": "euler", "scheduler": "simple",
                         "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage",
              "inputs": {"images": ["8", 0], "filename_prefix": "buffy"}},
    }


# ─── Auto-connect registry ──────────────────────────────────────────────────
# The Colab/Kaggle script POSTs its public tunnel URL to /api/register, so the
# website finds the GPU server on its own. In memory only: re-running the
# one-line script simply registers a new URL.
_REMOTE = {"url": "", "ts": 0.0}
_PROBE = {"ts": 0.0, "ok": False, "caps": {}}
_REMOTE_LOCK = threading.Lock()
TUNNEL_TOKEN = os.environ.get("TUNNEL_TOKEN", "").strip()
PROBE_TTL = 10.0


def remote_url() -> str:
    with _REMOTE_LOCK:
        return _REMOTE["url"]


def remote_probe() -> dict:
    """Cached /api/health of the GPU server: {"alive": bool, "video": "on"}.

    The Render side has no ComfyUI of its own, so the browser cannot tell from a
    local check whether the far end has the video model. Cache its answer here.
    """
    url = remote_url()
    if not url:
        return {"alive": False}
    now = time.time()
    with _REMOTE_LOCK:
        if now - _PROBE["ts"] < PROBE_TTL:
            return dict(_PROBE["caps"])
    caps = {"alive": False}
    try:
        r = requests.get(url + "/api/health", timeout=4)
        if r.ok:
            body = r.json() or {}
            caps = {"alive": True, "video": body.get("video", ""),
                    "image": body.get("image", "")}
    except Exception:  # noqa: BLE001
        pass
    with _REMOTE_LOCK:
        _PROBE.update(ts=now, ok=bool(caps.get("alive")), caps=caps)
    return caps


def remote_alive() -> bool:
    """Cheap liveness probe, cached for PROBE_TTL seconds."""
    return bool(remote_probe().get("alive"))


def image_ready() -> bool:
    """True when a ComfyUI instance is reachable next to this server."""
    if not IMAGE_BASE_URL:
        return False
    try:
        return requests.get(IMAGE_BASE_URL + "/system_stats", timeout=3).ok
    except Exception:  # noqa: BLE001
        return False


def generate_image(prompt: str, width: int = 1024, height: int = 1024,
                   steps: int = 0):
    """(base64_png, error_message). Blocks until ComfyUI finishes."""
    seed = int(time.time()) % 2147483647
    negative = "blurry, low quality, watermark, text, deformed"
    try:
        r = requests.post(
            IMAGE_BASE_URL + "/prompt",
            json={"prompt": _workflow(prompt, negative, width, height, seed, steps)},
            timeout=30,
        )
        if r.status_code != 200:
            return None, "ComfyUI បដិសេធ (HTTP %s)៖ %s" % (r.status_code, r.text[:180])
        pid = (r.json() or {}).get("prompt_id")
        if not pid:
            return None, "ComfyUI មិនផ្តល់ prompt_id — សូមពិនិត្យ workflow"
        deadline = time.time() + IMAGE_TIMEOUT
        while time.time() < deadline:
            time.sleep(2)
            hist = requests.get(IMAGE_BASE_URL + "/history/" + pid, timeout=10).json() or {}
            entry = hist.get(pid) or {}
            for node in (entry.get("outputs") or {}).values():
                for img in (node.get("images") or []):
                    v = requests.get(
                        IMAGE_BASE_URL + "/view",
                        params={"filename": img.get("filename", ""),
                                "subfolder": img.get("subfolder", ""),
                                "type": img.get("type", "output")},
                        timeout=60,
                    )
                    if v.status_code == 200 and v.content:
                        return base64.b64encode(v.content).decode(), None
            if (entry.get("status") or {}).get("status_str") == "error":
                return None, "ការបង្កើតរូបបរាជ័យ — សូមមើល log ComfyUI ក្នុង Kaggle"
        return None, "អស់ពេលរង់ចាំ — model ២២GB យឺតលើ T4។ សាកម្តងទៀត ឬប្រើ model ស្រាល"
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return None, "មិនអាចភ្ជាប់ទៅ ComfyUI បានទេ៖ %s" % str(exc)[:120]


# ─── Video: រូប → វីដេអូ (LTX-Video 2B) ───────────────────────────────────────
def _clamp_frames(n) -> int:
    """LTX latents step by 8, so the frame count must be 8n+1 (97, 121, 257)."""
    n = max(33, min(257, int(n or VIDEO_FRAMES)))
    return ((n - 1) // 8) * 8 + 1


def _video_workflow(prompt: str, negative: str, image_name: str, width: int,
                    height: int, frames: int, seed: int, steps: int = 0) -> dict:
    """ComfyUI's official LTXV image-to-video graph.

    The checkpoint ships MODEL+VAE but no CLIP, so the T5 encoder is loaded on
    its own. The template drives sampling through LTXVScheduler + SamplerCustom:
    a plain KSampler ignores the LTX sigma shift and comes out muddy.
    """
    steps = steps or VIDEO_STEPS
    return {
        "44": {"class_type": "CheckpointLoaderSimple",
               "inputs": {"ckpt_name": VIDEO_MODEL}},
        "38": {"class_type": "CLIPLoader",
               "inputs": {"clip_name": VIDEO_CLIP, "type": "ltxv",
                          "device": "default"}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": prompt, "clip": ["38", 0]}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative, "clip": ["38", 0]}},
        "78": {"class_type": "LoadImage",
               "inputs": {"image": image_name, "upload": "image"}},
        "77": {"class_type": "LTXVImgToVideo",
               "inputs": {"positive": ["6", 0], "negative": ["7", 0],
                          "vae": ["44", 2], "image": ["78", 0],
                          "width": width, "height": height, "length": frames,
                          "batch_size": 1, "strength": VIDEO_STRENGTH}},
        "69": {"class_type": "LTXVConditioning",
               "inputs": {"positive": ["77", 0], "negative": ["77", 1],
                          "frame_rate": float(VIDEO_FPS)}},
        "71": {"class_type": "LTXVScheduler",
               "inputs": {"steps": steps, "max_shift": 2.05, "base_shift": 0.95,
                          "stretch": True, "terminal": 0.1,
                          "latent": ["77", 2]}},
        "73": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "72": {"class_type": "SamplerCustom",
               "inputs": {"model": ["44", 0], "add_noise": True,
                          "noise_seed": seed, "cfg": VIDEO_CFG,
                          "positive": ["69", 0], "negative": ["69", 1],
                          "sampler": ["73", 0], "sigmas": ["71", 0],
                          "latent_image": ["77", 2]}},
        "8": {"class_type": "VAEDecode",
              "inputs": {"samples": ["72", 0], "vae": ["44", 2]}},
        # SaveWEBM (vp9) instead of SaveVideo: the newer video nodes want a Video
        # object plus a dynamic combo whose API shape is still in flux.
        "82": {"class_type": "SaveWEBM",
               "inputs": {"images": ["8", 0], "filename_prefix": "buffy-video",
                          "codec": "vp9", "fps": float(VIDEO_FPS), "crf": 32}},
    }


def _comfy_upload(image_bytes: bytes, name: str = "buffy-input.png"):
    """Put the source image where LoadImage can see it. (name, error)."""
    try:
        r = requests.post(
            IMAGE_BASE_URL + "/upload/image",
            files={"image": (name, image_bytes, "image/png")},
            data={"overwrite": "true", "type": "input"},
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return None, "បញ្ជូនរូបទៅ ComfyUI មិនបានទេ៖ %s" % str(exc)[:120]
    if r.status_code != 200:
        return None, "បញ្ជូនរូបទៅ ComfyUI មិនបាន (HTTP %s)៖ %s" % (r.status_code, r.text[:160])
    info = r.json() or {}
    nm = info.get("name") or name
    sub = info.get("subfolder") or ""
    return (sub + "/" + nm) if sub else nm, None


def _video_once(prompt, negative, image_name, width, height, frames, seed, steps):
    """(bytes, mime, error) for one ComfyUI run at a fixed frame count."""
    try:
        r = requests.post(
            IMAGE_BASE_URL + "/prompt",
            json={"prompt": _video_workflow(prompt, negative, image_name, width,
                                              height, frames, seed, steps)},
            timeout=60,
        )
        if r.status_code != 200:
            return None, None, "ComfyUI បដិសេធ workflow វីដេអូ (HTTP %s)៖ %s" % (
                r.status_code, r.text[:200])
        pid = (r.json() or {}).get("prompt_id")
        if not pid:
            return None, None, "ComfyUI មិនផ្តល់ prompt_id"
        deadline = time.time() + VIDEO_TIMEOUT
        while time.time() < deadline:
            time.sleep(3)
            hist = requests.get(IMAGE_BASE_URL + "/history/" + pid, timeout=15).json() or {}
            entry = hist.get(pid) or {}
            for node in (entry.get("outputs") or {}).values():
                for key in ("images", "gifs", "video", "videos"):
                    for f in (node.get(key) or []):
                        fn = (f.get("filename") or "")
                        if not fn.lower().endswith((".webm", ".mp4", ".mkv", ".mov")):
                            continue
                        v = requests.get(
                            IMAGE_BASE_URL + "/view",
                            params={"filename": fn,
                                    "subfolder": f.get("subfolder", ""),
                                    "type": f.get("type", "output")},
                            timeout=180,
                        )
                        if v.status_code == 200 and v.content:
                            mime = "video/webm" if fn.lower().endswith(".webm") else "video/mp4"
                            return v.content, mime, None
            if (entry.get("status") or {}).get("status_str") == "error":
                detail = json.dumps((entry.get("status") or {}).get("messages") or [])[:400]
                return None, None, "ការបង្កើតវីដេអូបរាជ័យ៖ %s" % detail
        return None, None, "អស់ពេលរង់ចាំវីដេអូ — សាកប្រើ ៥ វិនាទី (121 frames)"
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        return None, None, "មិនអាចភ្ជាប់ទៅ ComfyUI បានទេ៖ %s" % str(exc)[:120]


def generate_video(prompt: str, image_b64: str, width: int = 0, height: int = 0,
                   frames: int = 0, steps: int = 0):
    """(bytes, mime, error). Halves the length once if the GPU runs out of memory."""
    if not VIDEO_MODEL:
        return None, None, ("មុខងារវីដេអូមិនបានបើក — រត់បន្ទាត់ Kaggle/Colab "
                            "ដែលទាញ LTX សិន។")
    if not IMAGE_BASE_URL:
        return None, None, "មិនមាន ComfyUI ភ្ជាប់ — សូមរត់បន្ទាត់ Kaggle សិន។"
    width = max(256, min(1280, int(width or VIDEO_WIDTH)))
    height = max(256, min(1280, int(height or VIDEO_HEIGHT)))
    frames = _clamp_frames(frames)
    steps = max(4, min(60, int(steps or VIDEO_STEPS)))
    try:
        raw = base64.b64decode((image_b64 or "").split(",")[-1])
    except Exception:  # noqa: BLE001
        return None, None, "រូបប្រភពមិនត្រឹមត្រូវ"
    if len(raw) < 64:
        return None, None, "សូមផ្ញើរូបប្រភព (រូបដែលបង្កើតរួច) មកមុន"
    image_name, err = _comfy_upload(raw)
    if not image_name:
        return None, None, err

    negative = ("blurry, low quality, watermark, text, jitter, flicker, "
                "distorted, deformed, duplicate limbs")
    seed = int(time.time()) % 2147483647
    attempts = [frames]
    for f in (frames // 2, 65):
        f = _clamp_frames(f)
        if f not in attempts:
            attempts.append(f)

    last = None
    for f in attempts:
        data, mime, err = _video_once(prompt, negative, image_name, width, height,
                                      f, seed, steps)
        if data:
            return data, mime, None
        last = err
        # Only shrink when the failure is memory-related; anything else would
        # just burn ten more minutes to fail again.
        if "memory" not in (err or "").lower():
            break
    return None, None, last or "បង្កើតវីដេអូមិនបាន"


# ─── Image jobs ─────────────────────────────────────────────────────────────
# One image takes minutes on a T4 and the request crosses a tunnel plus a
# reverse proxy; both drop long-lived connections, which showed up as a spinner
# that never ended. So generation runs in a background thread and the browser
# polls short status calls instead.
_JOBS: dict = {}
_JOBS_LOCK = threading.Lock()
JOB_TTL = 1800.0
JOB_MAX = 24


def _job_set(jid: str, **kw) -> None:
    with _JOBS_LOCK:
        job = _JOBS.get(jid)
        if job is not None:
            job.update(kw)


def _job_snapshot(jid: str):
    with _JOBS_LOCK:
        job = _JOBS.get(jid)
        return dict(job) if job else None


def _job_gc() -> None:
    now = time.time()
    with _JOBS_LOCK:
        for jid in [j for j, v in _JOBS.items() if now - v["ts"] > JOB_TTL]:
            _JOBS.pop(jid, None)
        extra = len(_JOBS) - JOB_MAX
        if extra > 0:
            oldest = sorted(_JOBS.items(), key=lambda kv: kv[1]["ts"])[:extra]
            for jid, _v in oldest:
                _JOBS.pop(jid, None)


def _job_run(jid: str, prompt: str, width: int, height: int, steps: int) -> None:
    _job_set(jid, status="running", started=time.time())
    data, err = generate_image(prompt, width, height, steps)
    if data:
        _job_set(jid, status="done", png=data, error=None, ts=time.time())
    else:
        _job_set(jid, status="error", error=err or "បង្កើតរូបមិនបាន", ts=time.time())


class ImageReq(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 0


def _image_start_local(req: "ImageReq"):
    if not IMAGE_BASE_URL:
        return JSONResponse(
            {"detail": "មិនមាន ComfyUI ភ្ជាប់ — សូមរត់បន្ទាត់ Kaggle ក្នុង sidebar សិន។"},
            status_code=503,
        )
    _job_gc()
    width = max(256, min(2048, int(req.width or 1024)))
    height = max(256, min(2048, int(req.height or 1024)))
    steps = max(4, min(50, int(req.steps or IMAGE_STEPS)))
    jid = os.urandom(8).hex()
    with _JOBS_LOCK:
        _JOBS[jid] = {"status": "queued", "ts": time.time(), "started": 0.0,
                      "png": None, "error": None, "steps": steps,
                      "size": [width, height]}
    threading.Thread(
        target=_job_run,
        args=(jid, (req.prompt or "").strip() or "a beautiful scene",
              width, height, steps),
        daemon=True,
    ).start()
    return JSONResponse({"job_id": jid, "steps": steps, "size": [width, height]})


def _proxy_json(method: str, path: str, body=None, timeout: float = 20.0):
    """Forward one short JSON call to the registered GPU server, if any."""
    upstream = remote_url()
    if not upstream:
        return None
    try:
        r = requests.request(method, upstream + path, json=body, timeout=timeout)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return None
    try:
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception:  # noqa: BLE001
        return JSONResponse({"detail": r.text[:200]}, status_code=502)


class ImageIn(BaseModel):
    data: str = ""
    mime_type: str = "image/png"


class Turn(BaseModel):
    role: str = "user"
    text: str = ""


class ChatRequest(BaseModel):
    message: str = ""
    model: str = "local"
    web_search: bool = False
    image_mode: bool = False
    images: List[ImageIn] = []
    history: List[Turn] = []


def sse(obj: dict) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


def build_messages(req: ChatRequest, user_text: str = "") -> List[dict]:
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
    for turn in req.history[-10:]:
        text = (turn.text or "").strip()
        if not text:
            continue
        role = "user" if turn.role == "user" else "assistant"
        messages.append({"role": role, "content": text[:2500]})
    messages.append({"role": "user", "content": user_text or req.message.strip() or "(empty message)"})
    return messages


def chat_stream(req: ChatRequest):
    try:
        if req.images:
            yield sse(
                {
                    "type": "error",
                    "text": "ម៉ូដែល local នេះជា text-only — មិនអាចអានរូបភាពបានទេ។",
                }
            )
        if req.image_mode:
            if not IMAGE_BASE_URL:
                yield sse(
                    {
                        "type": "error",
                        "text": "បង្កើតរូបភាពត្រូវការ ComfyUI (ដំណើរការក្នុង Kaggle)។ "
                                "សូមរត់បន្ទាត់ Kaggle ដែលនៅក្នុង sidebar។",
                    }
                )
            else:
                yield sse({"type": "status", "text": "កំពុងបង្កើតរូបភាព… (រូបដំបូងយូរ ព្រោះត្រូវ load model)"})
                data, err = generate_image(req.message.strip() or "a beautiful scene")
                if data:
                    yield sse({"type": "image", "mime": "image/png", "data": data})
                    yield sse({"type": "status", "text": "✅ រូបភាពរួចរាល់"})
                else:
                    yield sse({"type": "error", "text": err or "បង្កើតរូបមិនបាន"})
            yield sse({"type": "done"})
            return

        base_url, model_name, headers = backend()
        yield sse({"type": "status", "text": "កំពុងគិត (%s)…" % mode()})

        user_text = req.message.strip()
        if req.web_search:
            yield sse({"type": "status", "text": "កំពុងស្វែងរកអ៊ីនធឺណិត…"})
            sources, notes = search_web(req.message.strip() or "What is this about?")
            if sources:
                yield sse({"type": "sources", "sources": sources})
            elif notes:
                yield sse({"type": "status", "text": notes})
            if isinstance(notes, list) and notes:
                user_text = with_web_context(user_text, notes)
            yield sse({"type": "status", "text": "កំពុងគិត (%s)…" % mode()})

        payload = {
            "model": model_name,
            "messages": build_messages(req, user_text),
            "stream": True,
            # ល្បឿន: ctx តូច → prompt ដំណើរការលឿន; ចម្លើយកំណត់ប្រវែង → token ទាប
            "max_tokens": 1400,
            "options": {"num_ctx": 4096, "num_predict": 1400, "temperature": 0.4},
        }
        resp = requests.post(
            base_url + "/v1/chat/completions",
            json=payload,
            headers=headers,
            stream=True,
            timeout=(10, 600),
        )
        if resp.status_code != 200:
            text = resp.text[:300]
            yield sse(
                {
                    "type": "error",
                    "text": "%s មិនឆ្លើយតបត្រឹមត្រូវ (HTTP %s)៖ %s"
                    % (mode(), resp.status_code, text),
                }
            )
            yield sse({"type": "done"})
            return

        started = False
        for raw in resp.iter_lines(decode_unicode=False):
            if not raw:
                continue
            # decode ជា UTF-8 ដោយខ្លួនឯង — បើទុកឲ្យ requests សម្គាល់ charset វាច្របូកច្របល់
            # អក្សរខ្មែរ (mojibake)
            if raw.startswith(b"data: "):
                raw = raw[6:].strip()
            if raw.strip() == b"[DONE]":
                break
            try:
                chunk = json.loads(raw.decode("utf-8"))
            except Exception:
                continue
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            piece = delta.get("content")
            if piece:
                if not started:
                    started = True
                    yield sse({"type": "status", "text": ""})
                yield sse({"type": "text", "text": piece})

        if not started:
            yield sse({"type": "error", "text": "ម៉ូដែលមិនបានផ្តល់ចម្លើយ។ សូមព្យាយាមម្ដងទៀត។"})
        yield sse({"type": "done"})
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        yield sse(
            {
                "type": "error",
                "text": "មិនអាចភ្ជាប់ទៅ %s បានទេ — តើ %s ត្រូវបានកំណត់ឬដំណើរការ? (%s)"
                % (mode(), backend()[0], str(exc)[:200]),
            }
        )
        yield sse({"type": "done"})


@app.post("/api/register")
def register(payload: dict):
    """A Colab/Kaggle session registers its public tunnel URL here so the
    website can reach that GPU server without anyone pasting a URL."""
    url = (payload.get("url") or "").strip().rstrip("/")
    key = (payload.get("key") or "").strip()
    if TUNNEL_TOKEN and not hmac.compare_digest(key, TUNNEL_TOKEN):
        return JSONResponse({"detail": "token មិនត្រឹមត្រូវ"}, status_code=401)
    # https only in production; loopback is allowed so the flow can be tested.
    if not (url.startswith("https://") or "127.0.0.1" in url or "localhost" in url):
        return JSONResponse({"detail": "url ត្រូវចាប់ផ្តើមដោយ https://"}, status_code=400)
    with _REMOTE_LOCK:
        _REMOTE["url"] = url
        _REMOTE["ts"] = time.time()
        _PROBE.update(ts=0.0, ok=False, caps={})
    return {"ok": True, "url": url}


@app.post("/api/chat")
def chat(req: ChatRequest, request: Request):
    if ACCESS_KEY and not _same_origin(request) and not _key_ok(request):
        return _unauthorized()
    upstream = remote_url()
    if upstream:
        body = req.model_dump() if hasattr(req, "model_dump") else req.dict()
        try:
            r = requests.post(upstream + "/api/chat", json=body, stream=True,
                              timeout=(10, 900))
            if r.status_code == 200:
                def relay():
                    for chunk in r.iter_content(512):
                        if chunk:
                            yield chunk

                return StreamingResponse(
                    relay(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache, no-transform",
                             "X-Accel-Buffering": "no"},
                )
            r.close()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    return StreamingResponse(
        chat_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/image/start")
def image_start(req: ImageReq):
    """Queue one image and return at once; the browser then polls the status."""
    body = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    proxied = _proxy_json("POST", "/api/image/start", body)
    if proxied is not None:
        return proxied
    return _image_start_local(req)


@app.get("/api/image/status/{jid}")
def image_status(jid: str):
    proxied = _proxy_json("GET", "/api/image/status/" + jid)
    if proxied is not None:
        return proxied
    snap = _job_snapshot(jid)
    if not snap:
        return JSONResponse({"detail": "រកមិនឃើញ job — សូមសាកម្តងទៀត។"}, status_code=404)
    started = snap.get("started") or snap["ts"]
    out = {"status": snap["status"],
           "elapsed": round(max(0.0, time.time() - started), 1),
           "steps": snap.get("steps")}
    if snap["status"] == "done":
        out["data"] = snap["png"]
        out["mime"] = "image/png"
    elif snap["status"] == "error":
        out["error"] = snap["error"]
    return out


class VideoReq(BaseModel):
    prompt: str = ""
    image: str = ""
    width: int = 768
    height: int = 512
    frames: int = 0
    steps: int = 0


def _video_job_run(jid: str, prompt: str, image: str, width: int, height: int,
                   frames: int, steps: int) -> None:
    _job_set(jid, status="running", started=time.time())
    data, mime, err = generate_video(prompt, image, width, height, frames, steps)
    if data:
        _job_set(jid, status="done", data=base64.b64encode(data).decode(),
                 mime=mime, error=None, ts=time.time())
    else:
        _job_set(jid, status="error", error=err or "បង្កើតវីដេអូមិនបាន", ts=time.time())


def _video_start_local(req: "VideoReq"):
    if not VIDEO_MODEL:
        return JSONResponse(
            {"detail": "មុខងារវីដេអូមិនបានបើក — រត់បន្ទាត់ Kaggle/Colab ម្តងទៀត"},
            status_code=503,
        )
    if not IMAGE_BASE_URL:
        return JSONResponse(
            {"detail": "មិនមាន ComfyUI ភ្ជាប់ — សូមរត់បន្ទាត់ Kaggle ក្នុង sidebar សិន។"},
            status_code=503,
        )
    if not (req.image or "").strip():
        return JSONResponse(
            {"detail": "សូមផ្ញើរូបប្រភព (រូបដែលបង្កើតរួច) មកមុន"}, status_code=400)
    _job_gc()
    width = max(256, min(1280, int(req.width or VIDEO_WIDTH)))
    height = max(256, min(1280, int(req.height or VIDEO_HEIGHT)))
    frames = _clamp_frames(req.frames or VIDEO_FRAMES)
    steps = max(4, min(60, int(req.steps or VIDEO_STEPS)))
    jid = os.urandom(8).hex()
    with _JOBS_LOCK:
        _JOBS[jid] = {"status": "queued", "ts": time.time(), "started": 0.0,
                      "data": None, "mime": None, "error": None, "kind": "video",
                      "frames": frames, "size": [width, height]}
    threading.Thread(
        target=_video_job_run,
        args=(jid, (req.prompt or "").strip() or "gentle natural motion, cinematic",
              req.image, width, height, frames, steps),
        daemon=True,
    ).start()
    return JSONResponse({"job_id": jid, "frames": frames, "size": [width, height],
                         "seconds": round(frames / float(VIDEO_FPS), 1)})


@app.post("/api/video/start")
def video_start(req: VideoReq):
    """Queue image→video and return at once; the browser polls like for images."""
    body = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    proxied = _proxy_json("POST", "/api/video/start", body, timeout=30)
    if proxied is not None:
        return proxied
    return _video_start_local(req)


@app.get("/api/video/status/{jid}")
def video_status(jid: str):
    proxied = _proxy_json("GET", "/api/video/status/" + jid)
    if proxied is not None:
        return proxied
    snap = _job_snapshot(jid)
    if not snap:
        return JSONResponse({"detail": "រកមិនឃើញ job — សូមសាកម្តងទៀត។"}, status_code=404)
    started = snap.get("started") or snap["ts"]
    out = {"status": snap["status"],
           "elapsed": round(max(0.0, time.time() - started), 1),
           "frames": snap.get("frames")}
    if snap["status"] == "done":
        out["data"] = snap["data"]
        out["mime"] = snap.get("mime") or "video/webm"
    elif snap["status"] == "error":
        out["error"] = snap["error"]
    return out


@app.get("/api/health")
def health(request: Request):
    """Reports the active engine. Deliberately never exposes the key value."""
    if ACCESS_KEY and not _same_origin(request) and not _key_ok(request):
        return _unauthorized()
    base_url, model_name, _headers = backend()
    if not API_BASE_URL:
        try:
            r = requests.get(base_url + "/v1/models", timeout=3)
            data = r.json().get("data") or []
            if data:
                model_name = data[0].get("id", "")
        except Exception:
            pass
    caps = remote_probe()
    return {
        "ok": True,
        "app": "Buffy AI",
        "mode": mode(),
        "engine": base_url,
        "model": model_name,
        "key_set": bool(API_KEY),
        "access_key_required": bool(ACCESS_KEY),
        "web_search": "exa" if EXA_API_KEY else "off",
        "image": "remote" if caps.get("alive") else ("comfyui" if image_ready() else "off"),
        "video": "on" if (VIDEO_MODEL or caps.get("video") == "on") else "off",
        "video_remote": caps.get("video") == "on",
        "remote": {"url": remote_url(), "alive": bool(caps.get("alive"))},
    }


# ---------------------------------------------------------------------------
# AppForge — one-click APK builds
# ---------------------------------------------------------------------------
# The browser builds the project files; this server only needs a GitHub token
# to create the repo, push them and hand the finished APK back. The token is
# read from the environment and never reaches the browser.
# Render keeps the key exactly as typed, so "Github_api" and "GITHUB_TOKEN"
# must both work; env names are case sensitive on Linux otherwise.
_AF_TOKEN_NAMES = ("GITHUB_TOKEN", "GH_TOKEN", "GITHUB_API", "GITHUB_API_KEY",
                   "Github_api", "Github_apiclassic")


def _af_clean(value: str) -> str:
    """Tokens never contain whitespace; a phone keyboard often adds some."""
    return "".join((value or "").split())


def _af_token_name() -> str:
    wanted = {n.lower() for n in _AF_TOKEN_NAMES}
    for name in _AF_TOKEN_NAMES:
        if _af_clean(os.environ.get(name, "")):
            return name
    for key, value in os.environ.items():
        if key.lower() in wanted and _af_clean(value):
            return key
    return ""


def _af_token() -> str:
    return _af_clean(os.environ.get(_af_token_name(), ""))


_AF_TOKEN = _af_token()  # kept for tests; endpoints re-read so a rotation works
_AF_API = "https://api.github.com"
_AF_HITS = {}
_AF_LOCK = threading.Lock()
_AF_MAX_FILES = 500
_AF_MAX_BYTES = 12_000_000
_AF_MAX_FILE = 5_000_000


def _gh_msg(resp) -> str:
    """GitHub explains refusals (scopes, size); surface that instead of a code."""
    try:
        msg = (resp.json() or {}).get("message") or ""
    except Exception:
        msg = ""
    return (msg or "").strip()[:160]


def _gh(method: str, path: str, payload=None):
    """Call the GitHub REST API with the server-side token."""
    return requests.request(
        method, _AF_API + path, json=payload, timeout=45,
        headers={
            "Authorization": "Bearer " + _af_token(),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "AppForge/1.0",
        },
    )


def _af_run_logs(full: str, run_id):
    """Download a run's log bundle.

    GitHub answers /actions/runs/<id>/logs with a 302 to a short-lived storage
    URL that rejects our Authorization header, so the redirect is read once and
    followed without it. The old code asked the wrong path and always fell back
    to the step summary — which is why a failed build showed no compiler error.
    """
    url = "%s/repos/%s/actions/runs/%s/logs" % (_AF_API, full, run_id)
    resp = requests.get(url, timeout=60, allow_redirects=False, headers={
        "Authorization": "Bearer " + _af_token(),
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AppForge/1.0",
    })
    if resp.status_code in (301, 302, 303, 307, 308):
        target = resp.headers.get("Location") or ""
        if not target:
            return None
        return requests.get(target, timeout=90, headers={"User-Agent": "AppForge/1.0"})
    return resp


_AF_SCOPE_CACHE = {"fp": "", "at": 0.0, "data": None}


def _af_token_scopes() -> dict:
    """Report which scopes the server-side token carries — never the token.

    A rotated PAT silently breaks builds when `repo` or `workflow` is missing,
    so /ready?scopes=1 exposes GitHub's `x-oauth-scopes` header instead of
    making an operator paste a secret somewhere to find out.
    """
    token = _af_token()
    if not token:
        return {"scopes": [], "missing": ["repo", "workflow"],
                "sufficient": False, "can_delete_repo": False}
    fp = hashlib.sha256(token.encode()).hexdigest()[:12]
    with _AF_LOCK:
        cached = dict(_AF_SCOPE_CACHE)
    if cached["fp"] == fp and cached["data"] and time.time() - cached["at"] < 300:
        return cached["data"]
    try:
        resp = requests.get(
            _AF_API + "/user", timeout=8,
            headers={"Authorization": "Bearer " + token,
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "User-Agent": "AppForge/1.0"},
        )
        raw = resp.headers.get("x-oauth-scopes", "")
        data = {"scopes": [s.strip() for s in raw.split(",") if s.strip()],
                "status": resp.status_code,
                # fine-grained PATs send no x-oauth-scopes header at all
                "granular": bool(resp.status_code == 200 and not raw)}
    except Exception as exc:  # offline, DNS, timeout — report, never raise
        data = {"scopes": [], "status": 0, "error": type(exc).__name__}
    scopes = data["scopes"]
    if data.get("granular"):
        # Scope list is invisible for fine-grained tokens; GitHub gates per repo.
        data.update(missing=[], sufficient=True, can_delete_repo=None)
    else:
        ok = data.get("status") == 200
        data.update(missing=[s for s in ("repo", "workflow") if s not in scopes],
                    sufficient=ok and all(s in scopes for s in ("repo", "workflow")),
                    can_delete_repo="delete_repo" in scopes)
    with _AF_LOCK:
        _AF_SCOPE_CACHE.update(fp=fp, at=time.time(), data=data)
    return data


def _af_commit(full: str, files: list):
    """Push every project file as one commit. Returns an error string or None.

    The contents API needs a per-file `sha` to update an existing path, which
    fails on the README that `auto_init` creates. The Git Data API writes one
    tree instead, so N files cost N blob calls plus a single commit.
    """
    ref, tree_sha = "", ""
    for _attempt in range(6):
        r = _gh("GET", "/repos/%s/git/ref/heads/main" % full)
        if r.status_code == 200:
            ref = ((r.json() or {}).get("object") or {}).get("sha", "")
            break
        time.sleep(1)
    if ref:
        base = _gh("GET", "/repos/%s/git/commits/%s" % (full, ref))
        if base.status_code == 200:
            tree_sha = ((base.json() or {}).get("tree") or {}).get("sha", "")
    else:
        # auto_init had not finished: seed the branch so it has a parent commit.
        seed = _gh("PUT", "/repos/%s/contents/.appforge" % full, {
            "message": "Initialize", "branch": "main",
            "content": base64.b64encode(b"appforge").decode("ascii"),
        })
        if seed.status_code in (200, 201):
            r = _gh("GET", "/repos/%s/git/ref/heads/main" % full)
            if r.status_code == 200:
                ref = ((r.json() or {}).get("object") or {}).get("sha", "")

    entries = []
    for path, data in files:
        blob = _gh("POST", "/repos/%s/git/blobs" % full, {
            "content": base64.b64encode(data).decode("ascii"),
            "encoding": "base64",
        })
        if blob.status_code not in (200, 201):
            return "បញ្ជូន %s មិនបាន (GitHub %s: %s)" % (
                path, blob.status_code, _gh_msg(blob))
        entries.append({"path": path, "mode": "100644", "type": "blob",
                        "sha": (blob.json() or {}).get("sha", "")})

    body = {"tree": entries}
    if tree_sha:
        body["base_tree"] = tree_sha
    tree = _gh("POST", "/repos/%s/git/trees" % full, body)
    if tree.status_code not in (200, 201):
        return "បង្កើត tree មិនបាន (GitHub %s: %s)" % (tree.status_code, _gh_msg(tree))

    commit_body = {"message": "Add app project (AppForge IDE)",
                   "tree": (tree.json() or {}).get("sha", "")}
    if ref:
        commit_body["parents"] = [ref]
    made = _gh("POST", "/repos/%s/git/commits" % full, commit_body)
    if made.status_code not in (200, 201):
        return "បង្កើត commit មិនបាន (GitHub %s: %s)" % (made.status_code, _gh_msg(made))
    new_commit = (made.json() or {}).get("sha", "")

    if ref:
        upd = _gh("PATCH", "/repos/%s/git/refs/heads/main" % full,
                  {"sha": new_commit, "force": False})
        if upd.status_code != 200:
            return "ធ្វើបច្ចុប្បន្នភាព branch មិនបាន (GitHub %s: %s)" % (
                upd.status_code, _gh_msg(upd))
    return None


def _af_dispatch(full: str, files: list) -> None:
    """Kick the workflow explicitly. Ref updates do not always emit the push
    event Actions listens for, so the build would otherwise never start."""
    workflows = [p for p, _d in files if p.startswith(".github/workflows/")
                 and p.endswith((".yml", ".yaml"))]
    prefer = [w for w in workflows if "apk" in w]
    for path in (prefer or workflows)[:2]:
        _gh("POST", "/repos/%s/actions/workflows/%s/dispatches" % (
            full, path.rsplit("/", 1)[-1]), {"ref": "main"})


def _af_slug(repo: str) -> str:
    """Accept only owner/name, so the token cannot be pointed elsewhere."""
    parts = (repo or "").strip().split("/")
    if len(parts) != 2:
        return ""
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._"
    for part in parts:
        if not part or len(part) > 100 or any(ch not in allowed for ch in part):
            return ""
    return parts[0] + "/" + parts[1]


def _af_safe_name(raw) -> str:
    name = "".join(ch if (ch.isalnum() or ch in "-._") else "-" for ch in str(raw or "").strip())
    return name.strip("-._")[:60] or "appforge-app"


def _af_rate_ok(ip: str) -> bool:
    now = time.time()
    with _AF_LOCK:
        hits = [t for t in _AF_HITS.get(ip, []) if now - t < 600]
        if len(hits) >= 3:
            _AF_HITS[ip] = hits
            return False
        hits.append(now)
        _AF_HITS[ip] = hits
    return True


def _af_files(payload) -> list:
    files = payload.get("files") if isinstance(payload, dict) else None
    if not isinstance(files, list) or not files or len(files) > _AF_MAX_FILES:
        raise ValueError("បញ្ជីឯកសារមិនត្រឹមត្រូវ")
    out, total = [], 0
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("ឯកសារមិនត្រឹមត្រូវ")
        path = str(item.get("path") or "").strip().lstrip("/")
        if (not path or ".." in path or "\\" in path or len(path) > 200
                or "\x00" in path):
            raise ValueError("ឯកសារមិនត្រឹមត្រូវ: " + str(item.get("path"))[:60])
        if isinstance(item.get("b64"), str):
            try:
                data = base64.b64decode(item["b64"], validate=True)
            except Exception:
                raise ValueError("binary មិនត្រឹមត្រូវ: " + path)
        elif isinstance(item.get("text"), str):
            data = item["text"].encode("utf-8")
        else:
            raise ValueError("ឯកសារគ្មានមាតិកា: " + path)
        if len(data) > _AF_MAX_FILE:
            raise ValueError("ឯកសារធំពេក: " + path)
        total += len(data)
        if total > _AF_MAX_BYTES:
            raise ValueError("ឯកសារធំពេក")
        out.append((path, data))
    return out


@app.get("/api/appforge/ready")
def appforge_ready(request: Request):
    """Lets the page hide the button instead of failing on click.

    `?scopes=1` additionally reports the token's GitHub scopes (never the token
    itself) so a rotation can be confirmed without anyone sharing a secret.
    """
    out = {"ok": True, "github": bool(_af_token()), "build": "v7",
           "ide": True, "logs": True,
           "cleanup": bool(_af_clean(os.environ.get("ADMIN_KEY", ""))),
           "token_var": _af_token_name(),
           "env_names": sorted(k for k in os.environ
                               if "GITHUB" in k.upper() or k.lower().startswith("gh"))}
    if (request.query_params.get("scopes") or "").lower() in ("1", "true", "yes"):
        out["token"] = _af_token_scopes()
    return out


@app.post("/api/appforge/build")
async def appforge_build(request: Request):
    if not _af_token():
        return JSONResponse(
            {"detail": "Server មិនមាន GITHUB_TOKEN — បន្ថែមនៅ Render → Environment រួច deploy ម្តងទៀត។"},
            status_code=503,
        )
    ip = (request.client.host if request.client else "?") or "?"
    if not _af_rate_ok(ip):
        return JSONResponse(
            {"detail": "ច្រើនពេក — សូមរង់ចាំ ១០ នាទី ឬប្រើ ZIP ដោយដៃ។"},
            status_code=429,
        )
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        files = _af_files(payload)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    name = _af_safe_name((payload or {}).get("repo"))
    try:
        me = _gh("GET", "/user")
        if me.status_code != 200:
            return JSONResponse({"detail": "GitHub token មិនត្រឹមត្រូវ ឬផុតកំណត់ (%s)" % _gh_msg(me)}, status_code=502)
        owner = (me.json() or {}).get("login") or ""
        created = _gh("POST", "/user/repos", {
            "name": name,
            "private": bool(payload.get("private")),
            "auto_init": True,
            "description": "បង្កើតដោយ AppForge",
        })
        if created.status_code not in (201, 422):
            return JSONResponse(
                {"detail": "បង្កើត repo មិនបាន (GitHub %s: %s)" % (created.status_code, _gh_msg(created))},
                status_code=502,
            )
        full = owner + "/" + name
        error = _af_commit(full, files)
        if error:
            return JSONResponse({"detail": error}, status_code=502)
        _af_dispatch(full, files)
        html_url = (created.json() or {}).get("html_url") or ("https://github.com/" + full)
        return {"ok": True, "repo": full, "url": html_url, "files": len(files)}
    except requests.RequestException as exc:
        return JSONResponse({"detail": "ភ្ជាប់ GitHub មិនបាន: %s" % str(exc)[:120]}, status_code=502)


def _af_run_progress(full: str, run: dict) -> dict:
    """Build percentage from GitHub's own run/job step data.

    The number never moves on a timer: it changes only when GitHub reports
    another job step as completed, so a stalled build visibly stops instead of
    pretending to advance.
    """
    status = (run.get("status") or "").lower()
    if not status:
        return {"progress": 5, "step": "កំពុងរង់ចាំ GitHub", "steps_done": 0, "steps_total": 0}
    if status in ("queued", "requested", "waiting", "pending"):
        return {"progress": 15, "step": "រង់ចាំ runner", "steps_done": 0, "steps_total": 0}

    rows = []
    try:
        jobs = _gh("GET", "/repos/%s/actions/runs/%s/jobs" % (full, run.get("id")))
        if jobs.status_code == 200:
            rows = (jobs.json() or {}).get("jobs") or []
    except requests.RequestException:
        rows = []
    total = done = 0
    last_done, running = "", ""
    for job in rows:
        for step in job.get("steps") or []:
            total += 1
            name = step.get("name") or ""
            st = (step.get("status") or "")
            if st == "completed":
                done += 1
                last_done = name or last_done
            elif st == "in_progress" and name:
                running = running or name
    pct = 20 + int(round(75.0 * done / total)) if total else 20
    if status == "completed" and (run.get("conclusion") or "") == "success":
        pct = 100
    return {"progress": max(0, min(100, pct)),
            "step": running or last_done or "កំពុង build",
            "steps_done": done, "steps_total": total}


@app.get("/api/appforge/status")
def appforge_status(repo: str = ""):
    if not _af_token():
        return JSONResponse({"detail": "Server មិនមាន GITHUB_TOKEN"}, status_code=503)
    full = _af_slug(repo)
    if not full:
        return JSONResponse({"detail": "repo មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        runs = _gh("GET", "/repos/%s/actions/runs?per_page=1" % full)
        if runs.status_code != 200:
            return JSONResponse({"state": "unknown", "detail": "GitHub %s" % runs.status_code},
                                status_code=502)
        items = (runs.json() or {}).get("workflow_runs") or []
        if not items:
            return {"state": "starting", "repo": full, "run_url": "",
                    "progress": 10, "step": "កំពុងបង្កើត build",
                    "steps_done": 0, "steps_total": 0}
        run = items[0]
        status = run.get("status") or ""
        conclusion = run.get("conclusion") or ""
        if status in ("queued", "in_progress", "waiting", "requested"):
            state = "running"
        elif conclusion == "success":
            state = "done"
        elif conclusion:
            state = "failed"
        else:
            state = "running"
        art_names = []
        if state == "done":
            arts = _gh("GET", "/repos/%s/actions/runs/%s/artifacts" % (full, run.get("id")))
            if arts.status_code == 200:
                art_names = [str(a.get("name") or "")
                             for a in ((arts.json() or {}).get("artifacts") or [])]
        has = lambda kind: any(kind in n.lower() for n in art_names)  # noqa: E731
        return {
            "state": state, "status": status, "conclusion": conclusion,
            "run_url": run.get("html_url") or "", "apk_ready": has("apk"),
            "aab_ready": has("aab"), "keystore_ready": has("keystore"),
            "artifacts": art_names, "repo": full,
            **_af_run_progress(full, run),
        }
    except requests.RequestException as exc:
        return JSONResponse({"state": "unknown", "detail": str(exc)[:120]}, status_code=502)


_AF_ARTIFACTS = {
    "apk": (".apk", "application/vnd.android.package-archive", "app.apk"),
    "aab": (".aab", "application/octet-stream", "app-release.aab"),
    "keystore": (".jks", "application/octet-stream", "appforge.jks"),
}


@app.get("/api/appforge/apk")
def appforge_apk(repo: str = "", kind: str = "apk"):
    """Streams one build artifact (APK / AAB / keystore) from the newest success.

    `kind` decides which file inside the artifacts is returned, so a release
    build can hand out its signed AAB and the key it was signed with.
    """
    if not _af_token():
        return JSONResponse({"detail": "Server មិនមាន GITHUB_TOKEN"}, status_code=503)
    full = _af_slug(repo)
    if not full:
        return JSONResponse({"detail": "repo មិនត្រឹមត្រូវ"}, status_code=400)
    want = (kind or "apk").lower()
    if want not in _AF_ARTIFACTS:
        return JSONResponse({"detail": "ប្រភេទឯកសារមិនត្រឹមត្រូវ"}, status_code=400)
    ext, media, filename = _AF_ARTIFACTS[want]
    try:
        runs = _gh("GET", "/repos/%s/actions/runs?per_page=5" % full)
        items = ((runs.json() or {}).get("workflow_runs") or []) if runs.status_code == 200 else []
        run = next((r for r in items if r.get("conclusion") == "success"), None)
        if not run:
            return JSONResponse({"detail": "មិនទាន់មានឯកសារ — build មិនទាន់ជោគជ័យ"}, status_code=409)
        arts = _gh("GET", "/repos/%s/actions/runs/%s/artifacts" % (full, run.get("id")))
        art_list = ((arts.json() or {}).get("artifacts") or []) if arts.status_code == 200 else []
        if not art_list:
            return JSONResponse({"detail": "គ្មាន artifact"}, status_code=409)
        # Workflow steps name artifacts after what they hold, so try those first;
        # otherwise inspect each archive for a file with the wanted suffix.
        ordered = [a for a in art_list if want in str(a.get("name") or "").lower()]
        ordered += [a for a in art_list if a not in ordered]
        for art in ordered:
            archive = requests.get(
                art.get("archive_download_url"),
                headers={"Authorization": "Bearer " + _af_token(), "User-Agent": "AppForge/1.0"},
                timeout=180, allow_redirects=True,
            )
            if archive.status_code != 200:
                continue
            try:
                bundle = zipfile.ZipFile(io.BytesIO(archive.content))
            except zipfile.BadZipFile:
                continue
            target = next((n for n in bundle.namelist()
                           if n.lower().endswith(ext) and not n.endswith("/")), "")
            if not target:
                continue
            return Response(
                content=bundle.read(target),
                media_type=media,
                headers={"Content-Disposition": 'attachment; filename="%s"' % filename,
                         "Cache-Control": "no-store"},
            )
        return JSONResponse({"detail": "ក្នុង artifact គ្មាន %s" % ext}, status_code=404)
    except requests.RequestException as exc:
        return JSONResponse({"detail": "បរាជ័យ: %s" % str(exc)[:120]}, status_code=502)


_AF_BUILD_REPO = re.compile(r"^[a-z0-9][a-z0-9._-]{0,90}-apk-[a-z0-9]{4,13}$")


class RepoRef(BaseModel):
    repo: str = ""


def _af_admin_error(request: Request):
    """None when the caller proved admin rights, else the refusal response.

    Cleanup deletes repositories with the owner's token, so it must never be
    callable by a random visitor of this public site: without ADMIN_KEY set the
    feature stays off instead of exposing the token's write power.
    """
    want = _af_clean(os.environ.get("ADMIN_KEY", ""))
    if not want:
        return JSONResponse(
            {"detail": "Server មិនមាន ADMIN_KEY — បន្ថែមនៅ Render → Environment រួច deploy ម្តងទៀត។"},
            status_code=503)
    if len(want) < 8:
        return JSONResponse({"detail": "ADMIN_KEY ខ្លីពេក — ត្រូវមានយ៉ាងតិច ៨ តួ"}, status_code=503)
    got = _af_clean(request.headers.get("x-admin-key", ""))
    if not got or not hmac.compare_digest(got, want):
        return JSONResponse({"detail": "ADMIN_KEY មិនត្រឹមត្រូវ"}, status_code=401)
    return None


@app.get("/api/appforge/repositories")
def appforge_repositories(request: Request):
    """The repos this app created (build-shaped names), newest first."""
    refused = _af_admin_error(request)
    if refused is not None:
        return refused
    if not _af_token():
        return JSONResponse({"detail": "Server មិនមាន GITHUB_TOKEN"}, status_code=503)
    try:
        me = _gh("GET", "/user")
        if me.status_code != 200:
            return JSONResponse({"detail": "GitHub token មិនត្រឹមត្រូវ (%s)" % _gh_msg(me)}, status_code=502)
        login = ((me.json() or {}).get("login") or "")
        repos = _gh("GET", "/user/repos?per_page=100&affiliation=owner&sort=created&direction=desc")
        if repos.status_code != 200:
            return JSONResponse({"detail": "GitHub %s: %s" % (repos.status_code, _gh_msg(repos))},
                                status_code=502)
        items = []
        for repo in repos.json() or []:
            name = (repo.get("name") or "").lower()
            if not _AF_BUILD_REPO.match(name):
                continue
            items.append({
                "repo": "%s/%s" % (login or repo.get("owner", {}).get("login", ""), name),
                "url": repo.get("html_url") or "",
                "created": repo.get("created_at") or "",
                "private": bool(repo.get("private")),
            })
        return {"ok": True, "owner": login, "repositories": items}
    except requests.RequestException as exc:
        return JSONResponse({"detail": "ភ្ជាប់ GitHub មិនបាន: %s" % str(exc)[:120]}, status_code=502)


@app.post("/api/appforge/repository/delete")
def appforge_repository_delete(request: Request, ref: RepoRef):
    """Delete one build repo. Refuses anything the build flow did not name."""
    refused = _af_admin_error(request)
    if refused is not None:
        return refused
    if not _af_token():
        return JSONResponse({"detail": "Server មិនមាន GITHUB_TOKEN"}, status_code=503)
    parts = [p for p in (ref.repo or "").strip().split("/")]
    if len(parts) != 2 or not all(parts):
        return JSONResponse({"detail": "ទម្រង់ត្រូវជា owner/name"}, status_code=400)
    owner, name = parts[0], parts[1].lower()
    if not _AF_BUILD_REPO.match(name):
        return JSONResponse(
            {"detail": "បដិសេធ: repo នេះមិនមានឈ្មោះបែប build (<pkg>-apk-<ពេលវេលា>) ទេ"},
            status_code=400)
    try:
        me = _gh("GET", "/user")
        if me.status_code != 200:
            return JSONResponse({"detail": "GitHub token មិនត្រឹមត្រូវ (%s)" % _gh_msg(me)}, status_code=502)
        login = ((me.json() or {}).get("login") or "")
        if not login or owner.lower() != login.lower():
            return JSONResponse({"detail": "បដិសេធ: repo នេះមិនមែនជារបស់គណនី token ទេ"}, status_code=400)
        out = _gh("DELETE", "/repos/%s/%s" % (owner, name))
        if out.status_code not in (202, 204):
            return JSONResponse({"detail": "GitHub %s: %s" % (out.status_code, _gh_msg(out))},
                                status_code=502)
        return {"ok": True, "deleted": "%s/%s" % (owner, name)}
    except requests.RequestException as exc:
        return JSONResponse({"detail": "ភ្ជាប់ GitHub មិនបាន: %s" % str(exc)[:120]}, status_code=502)


def _appforge_page() -> str:
    """The IDE page; served from "/" with a <base> so relative URLs resolve."""
    for rel in (os.path.join("ide", "index.html"), "index.html"):
        try:
            with open(os.path.join(_APPFORGE_DIR, rel), "r", encoding="utf-8") as fh:
                html = fh.read()
        except OSError:
            continue
        if rel.startswith("ide"):
            # One <base> fixes every relative URL, including ../gen.js.
            html = html.replace("<head>", '<head>\n<base href="/appforge/ide/" />', 1)
        return html
    return ('<!doctype html><meta charset="utf-8"><title>AppForge</title>'
            '<p>AppForge: <a href="/appforge/">/appforge/</a></p>')


@app.get("/", response_class=HTMLResponse)
def index():
    """The landing page is AppForge now; the old chat UI lives at /buffy."""
    return HTMLResponse(_appforge_page(),
                        headers={"Cache-Control": "no-store, max-age=0"})


@app.get("/api/appforge/logs")
def appforge_logs(repo: str = ""):
    """Recent build log lines so the IDE can show why a build failed."""
    if not _af_token():
        return JSONResponse({"detail": "Server មិនមាន GITHUB_TOKEN"}, status_code=503)
    full = _af_slug(repo)
    if not full:
        return JSONResponse({"detail": "repo មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        runs = _gh("GET", "/repos/%s/actions/runs?per_page=1" % full)
        items = ((runs.json() or {}).get("workflow_runs") or []) if runs.status_code == 200 else []
        if not items:
            return {"ok": True, "logs": "មិនទាន់មាន build", "state": "starting"}
        run = items[0]
        jobs = _gh("GET", "/repos/%s/actions/runs/%s/jobs" % (full, run.get("id")))
        steps, lines = [], []
        for job in ((jobs.json() or {}).get("jobs") or []) if jobs.status_code == 200 else []:
            lines.append("▸ %s — %s" % (job.get("name"), job.get("conclusion") or job.get("status")))
            for step in job.get("steps") or []:
                steps.append({"name": step.get("name"), "status": step.get("status"),
                              "conclusion": step.get("conclusion")})
                lines.append("  %s %s" % (step.get("conclusion") or step.get("status"),
                                         step.get("name")))
        text, note = "", ""
        try:
            logs = _af_run_logs(full, run.get("id"))
            if logs is not None and logs.status_code == 200:
                try:
                    bundle = zipfile.ZipFile(io.BytesIO(logs.content))
                    chunks = []
                    for name in bundle.namelist():
                        chunks.append("--- " + name + " ---")
                        chunks.append(bundle.read(name).decode("utf-8", "replace"))
                    text = "\n".join(chunks)
                except zipfile.BadZipFile:
                    text = logs.text
            elif logs is not None:
                note = "log មិនទាន់រួចរាល់ (GitHub %s)" % logs.status_code
        except requests.RequestException as exc:
            note = str(exc)[:120]
        # A compiler error sits at the end of the run, so the tail is what matters.
        return {"ok": True, "state": "running" if run.get("status") != "completed" else "done",
                "conclusion": run.get("conclusion") or "", "steps": steps,
                "logs": (text or "\n".join(lines))[-40000:], "note": note,
                "run_url": run.get("html_url") or ""}
    except requests.RequestException as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=502)


@app.get("/buffy", response_class=HTMLResponse)
def buffy_chat():
    # no-store: a phone that cached the old page kept showing a UI with no 🎬
    # button, so the new build looked broken until a hard refresh.
    return HTMLResponse(PAGE, headers={"Cache-Control": "no-store, max-age=0",
                                       "Pragma": "no-cache"})
