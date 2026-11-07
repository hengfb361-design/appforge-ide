# -*- coding: utf-8 -*-
"""Project storage for the AppForge IDE.

Each project is a directory on the server, reached with an unguessable id plus
a per-project key the browser keeps. There are no accounts, so the key *is*
the isolation: every read and write has to present it.

Paths are validated twice — textually (no `..`, no absolute paths, no Windows
reserved characters) and again after joining, by checking the resolved path is
still inside the project directory. ZIP import repeats the same checks because
a zip entry name is attacker-controlled input.
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
import zipfile

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel

IDE_DATA_DIR = os.environ.get("IDE_DATA_DIR") or os.path.join(
    tempfile.gettempdir(), "appforge-ide")
IDE_MAX_FILE = 2 * 1024 * 1024
IDE_MAX_ASSET = 5 * 1024 * 1024
IDE_MAX_TOTAL = 40 * 1024 * 1024
IDE_MAX_FILES = 400
IDE_MAX_ZIP = 16 * 1024 * 1024
IDE_MAX_PROJECTS = 400
IDE_TEXT_EXT = {
    "txt", "md", "markdown", "html", "htm", "css", "scss", "js", "mjs",
    "jsx", "ts", "tsx", "json", "xml", "yml", "yaml", "kt", "kts", "java",
    "py", "php", "rb", "go", "rs", "c", "h", "cpp", "cs", "swift", "sql",
    "sh", "bat", "gradle", "properties", "pro", "svg", "toml", "ini", "env",
}
_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_BAD_CHARS = set('<>:"|?*\\')
_CREATE_HITS: dict = {}
_LOCK = threading.Lock()

router = APIRouter()


def _now() -> float:
    return time.time()


def _meta_file(pid: str) -> str:
    return os.path.join(IDE_DATA_DIR, pid, "meta.json")


def files_dir(pid: str) -> str:
    return os.path.join(IDE_DATA_DIR, pid, "files")


def _hash(key: str) -> str:
    return hashlib.sha256((key or "").encode("utf-8")).hexdigest()


def _meta(pid: str):
    if not _ID_RE.match(pid or ""):
        return None
    try:
        with open(_meta_file(pid), "r", encoding="utf-8") as fh:
            meta = json.load(fh)
    except (OSError, ValueError):
        return None
    return meta if isinstance(meta, dict) else None


def _save_meta(pid: str, meta: dict) -> None:
    path = _meta_file(pid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    meta["updated"] = _now()
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False)
    os.replace(tmp, path)


def _supplied_key(request: Request) -> str:
    return ((request.headers.get("x-project-key") or "").strip()
            or (request.query_params.get("key") or "").strip())


def _auth(pid: str, request: Request):
    meta = _meta(pid)
    supplied = _supplied_key(request)
    if not meta:
        return None, JSONResponse({"detail": "រកមិនឃើញ project"}, status_code=404)
    if not supplied or not hmac.compare_digest(_hash(supplied), meta.get("key", "")):
        return None, JSONResponse({"detail": "project key មិនត្រឹមត្រូវ"}, status_code=403)
    return meta, None


def _clean_name(raw) -> str:
    name = " ".join(str(raw or "").split())[:60]
    return name or "គម្រោងថ្មី"


def clean_path(raw, allow_empty: bool = False) -> str:
    """Validate a project-relative path, raising ValueError with a reason."""
    path = str(raw if raw is not None else "").strip().replace("\\", "/")
    while path.startswith("./"):
        path = path[2:]
    path = path.lstrip("/")
    if not path:
        if allow_empty:
            return ""
        raise ValueError("គ្មានឈ្មោះឯកសារ")
    if len(path) > 240:
        raise ValueError("ឈ្មោះឯកសារវែងពេក")
    if "\x00" in path or any(ch in _BAD_CHARS for ch in path):
        raise ValueError("ឈ្មោះមានតួអក្សរមិនអនុញ្ញាត")
    parts = path.split("/")
    if len(parts) > 12:
        raise ValueError("ថតជ្រៅពេក")
    for part in parts:
        if part in ("", ".", ".."):
            raise ValueError("path មិនត្រឹមត្រូវ")
        if len(part) > 100:
            raise ValueError("ឈ្មោះវែងពេក")
        # Only the VCS metadata folders are off limits. A name like
        # ".gitignore" or ".github" is a normal project file and used by every
        # generated Android template.
        if part.lower() in (".git", ".svn", ".hg"):
            raise ValueError("ថត " + part + " មិនអនុញ្ញាត")
    return "/".join(parts)


def _abs(pid: str, rel: str) -> str:
    base = os.path.realpath(files_dir(pid))
    target = os.path.realpath(os.path.join(base, rel))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("path ចេញក្រៅ project")
    return target


def is_text(rel: str) -> bool:
    ext = rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
    return ext in IDE_TEXT_EXT


def listing(pid: str) -> list:
    base = files_dir(pid)
    out = []
    for root, dirs, files in os.walk(base):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            rel = os.path.relpath(full, base).replace(os.sep, "/")
            out.append({"path": rel, "size": size, "binary": not is_text(rel)})
    out.sort(key=lambda f: f["path"])
    return out


def dir_listing(pid: str) -> list:
    """Every folder in the project, including ones that hold no files yet."""
    base = files_dir(pid)
    out = []
    for root, dirs, _files in os.walk(base):
        dirs.sort()
        for name in sorted(dirs):
            rel = os.path.relpath(os.path.join(root, name), base).replace(os.sep, "/")
            out.append(rel)
    out.sort()
    return out


def _usage(pid: str):
    total = count = 0
    for root, _dirs, files in os.walk(files_dir(pid)):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
            count += 1
    return count, total


def _write(pid: str, rel: str, data: bytes) -> None:
    full = _abs(pid, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as fh:
        fh.write(data)


def zip_bytes(pid: str) -> bytes:
    buf = io.BytesIO()
    base = files_dir(pid)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(base):
            dirs.sort()
            for name in sorted(files):
                full = os.path.join(root, name)
                rel = os.path.relpath(full, base).replace(os.sep, "/")
                zf.write(full, rel)
    return buf.getvalue()


def extract(pid: str, blob: bytes) -> int:
    """Safe ZIP import: no absolute paths, traversal, symlinks or bombs."""
    if len(blob) > IDE_MAX_ZIP:
        raise ValueError("ZIP ធំពេក (អតិបរមា ១៦MB)")
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        raise ValueError("ឯកសារ ZIP មិនត្រឹមត្រូវ")
    infos = zf.infolist()
    if len(infos) > IDE_MAX_FILES:
        raise ValueError("ZIP មានឯកសារច្រើនពេក")
    plan, total = [], 0
    for info in infos:
        if info.is_dir():
            continue
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or ".." in name.split("/") or "\x00" in name:
            raise ValueError("ZIP មាន path មិនល្អ: " + name[:60])
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError("ZIP មាន symlink")
        if info.flag_bits & 0x1:
            raise ValueError("ZIP មានពាក្យសម្ងាត់")
        try:
            rel = clean_path(name)
        except ValueError as exc:
            raise ValueError("ZIP: %s (%s)" % (str(exc), name[:60]))
        if info.file_size > IDE_MAX_ASSET:
            raise ValueError("ឯកសារក្នុង ZIP ធំពេក: " + rel)
        total += info.file_size
        if total > IDE_MAX_TOTAL:
            raise ValueError("ZIP ធំពេកបន្ទាប់ពីពន្លាត")
        plan.append((rel, info))
    for rel, info in plan:
        with zf.open(info, "r") as src:
            data = src.read(IDE_MAX_ASSET + 1)
        if len(data) > IDE_MAX_ASSET:
            raise ValueError("ឯកសារក្នុង ZIP ធំពេក: " + rel)
        _write(pid, rel, data)
    return len(plan)


def _rate_ok(ip: str) -> bool:
    now = time.time()
    with _LOCK:
        hits = [t for t in _CREATE_HITS.get(ip, []) if now - t < 3600]
        if len(hits) >= 30:
            _CREATE_HITS[ip] = hits
            return False
        hits.append(now)
        _CREATE_HITS[ip] = hits
    return True


def _trim() -> None:
    try:
        names = [n for n in os.listdir(IDE_DATA_DIR) if _ID_RE.match(n)]
    except OSError:
        return
    if len(names) <= IDE_MAX_PROJECTS:
        return
    rows = []
    for name in names:
        try:
            rows.append((os.path.getmtime(_meta_file(name)), name))
        except OSError:
            rows.append((0, name))
    rows.sort()
    for _ts, name in rows[: len(rows) - IDE_MAX_PROJECTS]:
        shutil.rmtree(os.path.join(IDE_DATA_DIR, name), ignore_errors=True)


def limits() -> dict:
    return {"max_file": IDE_MAX_FILE, "max_asset": IDE_MAX_ASSET,
            "max_total": IDE_MAX_TOTAL, "max_files": IDE_MAX_FILES,
            "max_zip": IDE_MAX_ZIP}


class ProjectIn(BaseModel):
    name: str = ""


@router.get("/api/ide/limits")
def ide_limits():
    return limits()


@router.post("/api/ide/project")
def ide_create(payload: ProjectIn, request: Request):
    ip = (request.client.host if request.client else "?") or "?"
    if not _rate_ok(ip):
        return JSONResponse({"detail": "បង្កើត project ច្រើនពេក — សូមរង់ចាំបន្តិច"},
                            status_code=429)
    os.makedirs(IDE_DATA_DIR, exist_ok=True)
    _trim()
    pid = os.urandom(16).hex()
    key = secrets.token_hex(16)
    name = _clean_name(payload.name)
    os.makedirs(files_dir(pid), exist_ok=True)
    _save_meta(pid, {"id": pid, "name": name, "key": _hash(key),
                     "created": _now()})
    return {"ok": True, "id": pid, "key": key, "name": name, "files": [],
            "limits": limits()}


@router.get("/api/ide/project/{pid}")
def ide_project(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    count, total = _usage(pid)
    return {"ok": True, "id": pid, "name": meta.get("name", ""),
            "files": listing(pid), "dirs": dir_listing(pid),
            "count": count, "bytes": total,
            "created": meta.get("created", 0)}


@router.delete("/api/ide/project/{pid}")
def ide_delete_project(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    shutil.rmtree(os.path.join(IDE_DATA_DIR, pid), ignore_errors=True)
    return {"ok": True}


@router.get("/api/ide/project/{pid}/file")
def ide_read_file(pid: str, request: Request, path: str = ""):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        rel = clean_path(path)
        full = _abs(pid, rel)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    if not os.path.isfile(full):
        return JSONResponse({"detail": "រកមិនឃើញឯកសារ"}, status_code=404)
    if not is_text(rel):
        return JSONResponse({"detail": "ឯកសារ binary — ប្រើ /asset"}, status_code=415)
    try:
        with open(full, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=500)
    return {"ok": True, "path": rel, "text": text,
            "size": len(text.encode("utf-8"))}


@router.put("/api/ide/project/{pid}/file")
async def ide_write_file(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        rel = clean_path((body or {}).get("path"))
        text = (body or {}).get("text")
        if not isinstance(text, str):
            raise ValueError("គ្មានមាតិកា")
        data = text.encode("utf-8")
        if len(data) > IDE_MAX_FILE:
            raise ValueError("ឯកសារធំពេក (អតិបរមា ២MB)")
        count, total = _usage(pid)
        old = 0
        try:
            old = os.path.getsize(_abs(pid, rel))
        except OSError:
            pass
        if count + (0 if old else 1) > IDE_MAX_FILES:
            raise ValueError("ឯកសារច្រើនពេក")
        if total - old + len(data) > IDE_MAX_TOTAL:
            raise ValueError("project ធំពេក (អតិបរមា ៤០MB)")
        _write(pid, rel, data)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=500)
    _save_meta(pid, meta)
    return {"ok": True, "path": rel, "size": len(data)}


@router.put("/api/ide/project/{pid}/asset")
async def ide_write_asset(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        rel = clean_path((body or {}).get("path"))
        raw = str((body or {}).get("data") or "")
        if raw.startswith("data:") and "," in raw[:80]:
            raw = raw.split(",", 1)[1]
        data = base64.b64decode(raw + "=" * (-len(raw) % 4), validate=False)
        if not data:
            raise ValueError("ឯកសារទទេ")
        if len(data) > IDE_MAX_ASSET:
            raise ValueError("ឯកសារធំពេក (អតិបរមា ៥MB)")
        count, total = _usage(pid)
        old = 0
        try:
            old = os.path.getsize(_abs(pid, rel))
        except OSError:
            pass
        if count + (0 if old else 1) > IDE_MAX_FILES:
            raise ValueError("ឯកសារច្រើនពេក")
        if total - old + len(data) > IDE_MAX_TOTAL:
            raise ValueError("project ធំពេក")
        _write(pid, rel, data)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=400)
    _save_meta(pid, meta)
    return {"ok": True, "path": rel, "size": len(data)}


@router.get("/api/ide/project/{pid}/asset")
def ide_read_asset(pid: str, request: Request, path: str = ""):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        rel = clean_path(path)
        full = _abs(pid, rel)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    if not os.path.isfile(full):
        return JSONResponse({"detail": "រកមិនឃើញឯកសារ"}, status_code=404)
    media = mimetypes.guess_type(full)[0] or "application/octet-stream"
    with open(full, "rb") as fh:
        data = fh.read()
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition":
                             'attachment; filename="%s"' % os.path.basename(full),
                             "Cache-Control": "no-store"})


@router.post("/api/ide/project/{pid}/move")
async def ide_move(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        src = clean_path((body or {}).get("from"))
        dst = clean_path((body or {}).get("to"))
        src_full = _abs(pid, src)
        dst_full = _abs(pid, dst)
        if not os.path.exists(src_full):
            raise ValueError("រកមិនឃើញឯកសារដើម")
        if os.path.exists(dst_full):
            return JSONResponse({"detail": "ឈ្មោះនេះមានរួចហើយ"}, status_code=409)
        os.makedirs(os.path.dirname(dst_full), exist_ok=True)
        os.replace(src_full, dst_full)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=500)
    _save_meta(pid, meta)
    return {"ok": True, "from": src, "to": dst}


@router.post("/api/ide/project/{pid}/delete")
async def ide_delete_path(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        rel = clean_path((body or {}).get("path"))
        full = _abs(pid, rel)
        if not os.path.exists(full):
            return JSONResponse({"detail": "រកមិនឃើញ"}, status_code=404)
        if os.path.isdir(full):
            shutil.rmtree(full)
        else:
            os.remove(full)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=500)
    _save_meta(pid, meta)
    return {"ok": True, "path": rel}


@router.post("/api/ide/project/{pid}/mkdir")
async def ide_mkdir(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        rel = clean_path((body or {}).get("path"))
        os.makedirs(_abs(pid, rel), exist_ok=True)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except OSError as exc:
        return JSONResponse({"detail": str(exc)[:120]}, status_code=500)
    _save_meta(pid, meta)
    return {"ok": True, "path": rel, "dirs": dir_listing(pid)}


@router.get("/api/ide/project/{pid}/zip")
def ide_zip(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    data = zip_bytes(pid)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", meta.get("name", "project")) or "project"
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition":
                             'attachment; filename="%s.zip"' % safe[:40],
                             "Cache-Control": "no-store"})


@router.post("/api/ide/project/{pid}/import")
async def ide_import(pid: str, request: Request):
    meta, err = _auth(pid, request)
    if err:
        return err
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "JSON មិនត្រឹមត្រូវ"}, status_code=400)
    raw = str((body or {}).get("data") or "")
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]
    try:
        blob = base64.b64decode(raw + "=" * (-len(raw) % 4), validate=False)
    except Exception:
        return JSONResponse({"detail": "ZIP data មិនត្រឹមត្រូវ"}, status_code=400)
    try:
        added = extract(pid, blob)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    _save_meta(pid, meta)
    return {"ok": True, "added": added, "files": listing(pid)}


_PREVIEW_HOOK = (
    "<script>(function(){var send=function(m){try{parent.postMessage(m,'*')}catch(e){}};"
    "window.addEventListener('error',function(e){send({__ide:1,type:'error',"
    "message:String(e.message||'Script error'),line:e.lineno||0,column:e.colno||0,"
    "file:String(e.filename||'')})});"
    "window.addEventListener('unhandledrejection',function(e){var r=e.reason||{};"
    "send({__ide:1,type:'error',message:'Unhandled promise: '+String(r.message||r)})});"
    "['log','warn','error','info'].forEach(function(k){var f=console[k];console[k]=function(){"
    "try{send({__ide:1,type:'console',level:k,args:Array.prototype.map.call(arguments,"
    "function(a){try{return a&&typeof a==='object'?JSON.stringify(a):String(a)}catch(x){return String(a)}})});"
    "}catch(x){};return f.apply(console,arguments)}});"
    "send({__ide:1,type:'ready'});})();</script>"
)


@router.get("/p/{pid}/{key}/{path:path}")
def ide_preview(pid: str, key: str, path: str = ""):
    """Serves project files to the sandboxed preview iframe.

    The key travels in the URL because an opaque-origin iframe cannot send
    headers; the id and key together are the same secret the editor holds.
    """
    meta = _meta(pid)
    if not meta or not key or not hmac.compare_digest(_hash(key), meta.get("key", "")):
        return JSONResponse({"detail": "រកមិនឃើញ"}, status_code=404)
    rel = path or ""
    if not rel or rel.endswith("/"):
        rel = rel + "index.html"
    try:
        clean = clean_path(rel)
        full = _abs(pid, clean)
    except ValueError:
        return JSONResponse({"detail": "path មិនត្រឹមត្រូវ"}, status_code=400)
    if os.path.isdir(full):
        full = os.path.join(full, "index.html")
        clean = clean.rstrip("/") + "/index.html"
    if not os.path.isfile(full):
        safe = clean.replace("<", "&lt;")
        return HTMLResponse(
            "<!doctype html><meta charset='utf-8'><body style='font:14px system-ui;"
            "background:#0d1117;color:#c9d1d9;padding:24px'>"
            "<b>រកមិនឃើញ " + safe + "</b>"
            "<p>បង្កើត <code>index.html</code> នៅ root ដើម្បីមើលជាមុន។</p></body>",
            status_code=404)
    media = mimetypes.guess_type(full)[0] or "application/octet-stream"
    try:
        with open(full, "rb") as fh:
            raw = fh.read()
    except OSError:
        return JSONResponse({"detail": "អានឯកសារមិនបាន"}, status_code=500)
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if media.startswith("text/") or media in ("application/javascript",
                                              "application/json"):
        body = raw.decode("utf-8", "replace")
        if clean.endswith((".html", ".htm")):
            lower = body.lower()
            at = lower.find("<head")
            if at >= 0:
                end = body.find(">", at)
                body = body[:end + 1] + _PREVIEW_HOOK + body[end + 1:]
            else:
                body = _PREVIEW_HOOK + body
        return Response(content=body.encode("utf-8"), media_type=media,
                        headers=headers)
    return Response(content=raw, media_type=media, headers=headers)
