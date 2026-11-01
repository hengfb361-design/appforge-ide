#!/usr/bin/env bash
# Buffy AI — Qwen-Image (បង្កើតរូបភាព) ក្នុង Google Kaggle ដោយបន្ទាត់តែមួយ។
#
# ក្នុង cell ថ្មីរបស់ Kaggle សរសេរបន្ទាត់នេះ (មាន «!» នៅដើម)៖
#
#   !curl -fsSL -o /kaggle/working/buffy-image-start.sh https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main/kaggle-start.sh && bash /kaggle/working/buffy-image-start.sh
#
# script នេះនឹង៖
#   ១. ពិនិត្យ GPU / VRAM / disk
#   ២. ដំឡើង ComfyUI (engine សម្រាប់ Qwen-Image)
#   ៣. ទាញយក qwen_image_fp8_hq.safetensors + text encoder + VAE ទៅ /kaggle/temp
#   ៤. បើក ComfyUI (ផ្ទៃក្នុង) + server Buffy (local_app.py) + tunnel តែមួយ
#   ៥. បង្ហាញ URL សម្រាប់ website — គ្មាន API key ត្រូវការ
#
# ជម្រើស model (env BUFFY_IMAGE_MODEL = auto | fp8_hq | int8_2_1)៖
#   auto     = ជ្រើសតាម VRAM (លំនាំដើម) — VRAM < 24GB → int8_2_1
#   fp8_hq   = Qwen-Image fp8_hq · 22.7 + 9.4 + 0.3GB = 32.4GB (ត្រូវការ VRAM ≥ 24GB)
#   int8_2_1 = Qwen-Image-2.1 · 7.3 + 6.3 + 0.7GB = 14.3GB (សម T4 15GB)
#
# ហេតុអ្វី auto ជ្រើស int8 លើ T4៖ weights 32.4GB ធំជាងទាំង VRAM ១៥GB និង RAM ៣០GB
# → ComfyUI ត្រូវអាន weight ពី disk រាល់ជំហាន (~៣០ វិនាទី/ជំហាន)។ លើសពីនេះ T4 គ្មាន FP8
# tensor core ដូច្នេះ fp8 មិនផ្តល់ល្បឿនអ្វីទេ។ int8_2_1 សមក្នុង RAM/VRAM → ឈប់អានពី disk។

set -euo pipefail

RAW_BASE="${BUFFY_RAW_BASE:-https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main}"
WORK="${BUFFY_HOME:-/kaggle/working/buffy-image}"
COMFY_PORT="${COMFY_PORT:-8188}"
PORT="${PORT:-8000}"

# model ធំៗ ត្រូវដាក់ /kaggle/temp (quota ខ្ពស់ជាង /kaggle/working ~20GB)
MODELS_DIR="${BUFFY_MODELS_DIR:-/kaggle/temp/buffy-image-models}"

say()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✅ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠️  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || die "រកមិនឃើញ python3"
command -v curl    >/dev/null 2>&1 || die "រកមិនឃើញ curl"

# ─── ១/៥  ពិនិត្យ GPU ────────────────────────────────────────────────────────
say "១/៥  ពិនិត្យ GPU"
VRAM_GIB=0
if command -v nvidia-smi >/dev/null 2>&1; then
  MIB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -dc '0-9' || true)
  [ -n "${MIB:-}" ] && VRAM_GIB=$(( MIB / 1024 ))
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || true
fi
if [ "$VRAM_GIB" -eq 0 ]; then
  warn "រកមិនឃើញ GPU — សូមបើក Settings → Accelerator → GPU T4 x2 ក្នុង Kaggle សិន"
  die  "ត្រូវការ GPU សម្រាប់បង្កើតរូបភាព"
fi
ok "GPU មាន VRAM ${VRAM_GIB}GB"

MEM_GIB=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || true)
MEM_GIB=${MEM_GIB:-0}
ok "RAM មាន ${MEM_GIB}GB"

# ─── ២/៥  ជ្រើស model + ពិនិត្យ disk ─────────────────────────────────────────
say "២/៥  ជ្រើស model និងពិនិត្យទំហំ disk"
MODEL_CHOICE="${BUFFY_IMAGE_MODEL:-auto}"

if [ "$MODEL_CHOICE" = "auto" ]; then
  if [ "$VRAM_GIB" -ge 24 ]; then MODEL_CHOICE="fp8_hq"; else MODEL_CHOICE="int8_2_1"; fi
  ok "ជ្រើស model ស្វ័យប្រវត្តិ: $MODEL_CHOICE (VRAM ${VRAM_GIB}GB · RAM ${MEM_GIB}GB)"
fi

case "$MODEL_CHOICE" in
  fp8_hq)
    DM_REPO="Comfy-Org/Qwen-Image";  DM_FILE="split_files/diffusion_models/qwen_image_fp8_hq.safetensors";     DM_GB=23
    TE_REPO="Comfy-Org/Qwen-Image";  TE_FILE="split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"; TE_GB=10
    VA_REPO="Comfy-Org/Qwen-Image";  VA_FILE="split_files/vae/qwen_image_vae.safetensors";                      VA_GB=1
    DM_NAME="qwen_image_fp8_hq.safetensors"
    TE_NAME="qwen_2.5_vl_7b_fp8_scaled.safetensors"
    VA_NAME="qwen_image_vae.safetensors"
    LABEL="Qwen-Image fp8_hq (គុណភាពខ្ពស់បំផុត)" ;;
  int8_2_1)
    DM_REPO="Comfy-Org/Qwen-Image-2.1"; DM_FILE="diffusion_models/qwen_image_2.1_int8_convrot.safetensors"; DM_GB=8
    TE_REPO="Comfy-Org/Qwen-Image-2.1"; TE_FILE="text_encoders/qwen3vl_8b_w4a8.safetensors";                TE_GB=7
    VA_REPO="Comfy-Org/Qwen-Image-2.1"; VA_FILE="vae/qwen_image_2.1_vae_bf16.safetensors";                   VA_GB=1
    DM_NAME="qwen_image_2.1_int8_convrot.safetensors"
    TE_NAME="qwen3vl_8b_w4a8.safetensors"
    VA_NAME="qwen_image_2.1_vae_bf16.safetensors"
    LABEL="Qwen-Image-2.1 int8 (ស្រាល — សម T4)" ;;
  *) die "BUFFY_IMAGE_MODEL មិនស្គាល់: $MODEL_CHOICE (ប្រើ auto, fp8_hq ឬ int8_2_1)" ;;
esac

WEIGHTS_GB=$(( DM_GB + TE_GB + VA_GB ))
if [ "$MEM_GIB" -gt 0 ] && [ "$WEIGHTS_GB" -gt "$MEM_GIB" ]; then
  warn "weights ${WEIGHTS_GB}GB > RAM ${MEM_GIB}GB → ត្រូវអានពី disk រាល់ជំហាន (យឺត ~៣០ វិនាទី/ជំហាន)"
  echo "   ដំណោះស្រាយ៖ !BUFFY_IMAGE_MODEL=int8_2_1 bash /kaggle/working/buffy-image-start.sh"
fi

NEED_GB=$(( DM_GB + TE_GB + VA_GB + 6 ))
mkdir -p "$MODELS_DIR" "$WORK" || die "បង្កើត $MODELS_DIR មិនបាន"

FREE_GB=$(df -BG --output=avail "$MODELS_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
FREE_GB=${FREE_GB:-0}
echo "   model  : $LABEL"
echo "   ត្រូវការ: ~${NEED_GB}GB   ទំនេរ: ${FREE_GB}GB   (ទីតាំង: $MODELS_DIR)"

if [ "$FREE_GB" -lt "$NEED_GB" ]; then
  warn "disk មិនគ្រប់!"
  echo "   ដំណោះស្រាយ ១ — ប្រើ model ស្រាលជាង (សម T4 16GB ផងដែរ)៖"
  echo "   !BUFFY_IMAGE_MODEL=int8_2_1 bash /kaggle/working/buffy-image-start.sh"
  echo "   ដំណោះស្រាយ ២ — Kaggle → Settings → 'Clear working directory' រួច run ម្តងទៀត"
  die "គ្មានទំហំគ្រប់សម្រាប់ $LABEL"
fi
ok "disk គ្រប់"

# ─── ៣/៥  ComfyUI ───────────────────────────────────────────────────────────
say "៣/៥  ដំឡើង ComfyUI"
if [ ! -d "$WORK/ComfyUI/.git" ]; then
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$WORK/ComfyUI" \
    || die "clone ComfyUI មិនបាន"
fi
cd "$WORK/ComfyUI"

# torch មានស្រាប់ក្នុង Kaggle — មិនដំឡើងឡើងវិញ (សន្សំ disk/ពេល)
python3 -m pip install -q --upgrade pip >/dev/null 2>&1 || true
python3 -m pip install -q -r requirements.txt 2>&1 | tail -3 || die "pip install មិនបាន"
python3 -m pip install -q huggingface_hub 2>&1 | tail -2 || true
ok "ComfyUI រួចរាល់"

# ─── ៤/៥  ទាញយក model ──────────────────────────────────────────────────────
say "៤/៥  ទាញយក model (${DM_GB}+${TE_GB}+${VA_GB}GB) — អាចយូរ 5-15 នាទី"

python3 - "$MODELS_DIR" "$DM_REPO" "$DM_FILE" "$TE_REPO" "$TE_FILE" "$VA_REPO" "$VA_FILE" <<'PY'
import os, sys, shutil
from huggingface_hub import hf_hub_download

models_dir, dm_repo, dm_file, te_repo, te_file, va_repo, va_file = sys.argv[1:8]
MAP = {
    "diffusion_models": (dm_repo, dm_file),
    "text_encoders": (te_repo, te_file),
    "vae": (va_repo, va_file),
}
for sub, (repo, path) in MAP.items():
    dest_dir = os.path.join(models_dir, sub)
    os.makedirs(dest_dir, exist_ok=True)
    name = os.path.basename(path)
    target = os.path.join(dest_dir, name)
    if os.path.exists(target) and os.path.getsize(target) > 10_000_000:
        print("   ✓ មានស្រាប់:", name)
        continue
    print("   ⬇️  ", repo, path)
    got = hf_hub_download(repo_id=repo, filename=path, local_dir=dest_dir)
    if os.path.abspath(got) != os.path.abspath(target):
        shutil.move(got, target)
    print("   ✅", name, round(os.path.getsize(target) / 1e9, 2), "GB")
PY
ok "model ទាញយករួច"

# ComfyUI អាន model ពីខាងក្រៅ (មិន copy 32GB ចូល /kaggle/working)
cat > "$WORK/extra_model_paths.yaml" <<EOF
buffy:
  base_path: $MODELS_DIR
  diffusion_models: diffusion_models
  text_encoders: text_encoders
  vae: vae
EOF

# ─── ៥/៥  បើក ComfyUI + Buffy server + tunnel ────────────────────────────────
say "៥/៥  បើក ComfyUI, server Buffy និង tunnel"

cleanup() {
  trap - INT TERM EXIT
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  pkill -f "uvicorn local_app:app" 2>/dev/null || true
  pkill -f "ComfyUI/main.py" 2>/dev/null || true
  printf '\n\033[1;33m🔌 បានបិទ ComfyUI, server និង tunnel។\033[0m\n'
}
trap cleanup INT TERM EXIT

LOWVRAM_FLAG=""
if [ "$VRAM_GIB" -lt "$DM_GB" ]; then
  LOWVRAM_FLAG="--lowvram"
  warn "VRAM ${VRAM_GIB}GB < model ${DM_GB}GB → ប្រើ --lowvram (យឺត តែដំណើរការ)"
  if [ "$MODEL_CHOICE" = "fp8_hq" ] && [ "$VRAM_GIB" -lt 24 ]; then
    warn "fp8_hq យឺតខ្លាំងលើ T4 (~៣០ វិនាទី/ជំហាន)។ ប្រើ auto ដើម្បីលឿនជាង ~៣ ដង៖"
    echo "   !bash /kaggle/working/buffy-image-start.sh        # auto → int8_2_1"
  fi
fi

nohup python3 main.py --listen 127.0.0.1 --port "$COMFY_PORT" \
  --extra-model-paths-config "$WORK/extra_model_paths.yaml" \
  $LOWVRAM_FLAG >"$WORK/comfy.log" 2>&1 </dev/null &

ready=""
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:$COMFY_PORT/system_stats" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ -n "$ready" ] || die "ComfyUI មិនឡើង — សូមមើល $WORK/comfy.log"
ok "ComfyUI ដំណើរការ (port $COMFY_PORT)"

# Buffy server = អ្វីដែល website ភ្ជាប់ទៅ (បង្កើតរូប + UI)
cd "$WORK"
for f in local_app.py ui.py; do
  curl -fsSL -o "$WORK/$f" "$RAW_BASE/$f" || die "ទាញយក $f មិនបាន"
done
python3 -m pip install -q fastapi uvicorn requests 2>&1 | tail -2 || die "pip install fastapi មិនបាន"

# គ្មាន ACCESS_KEY → website មិនត្រូវការ key អ្វីទាំងអស់
IMAGE_BASE_URL="http://127.0.0.1:$COMFY_PORT" \
  IMAGE_MODEL="$DM_NAME" IMAGE_CLIP="$TE_NAME" IMAGE_VAE="$VA_NAME" \
  nohup python3 -m uvicorn local_app:app --host 127.0.0.1 --port "$PORT" \
  --log-level warning >"$WORK/ui.log" 2>&1 </dev/null &

ready=""
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || die "server Buffy មិនឡើង — សូមមើល $WORK/ui.log"
ok "server Buffy ដំណើរការ"

if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL -o /usr/local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    || die "ទាញយក cloudflared មិនបាន"
  chmod +x /usr/local/bin/cloudflared
fi
nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate \
  >"$WORK/tunnel.log" 2>&1 </dev/null &

PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$WORK/tunnel.log" | head -1 || true)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 1
done
[ -n "$PUBLIC_URL" ] || die "tunnel មិនចេញ URL — សូមមើល $WORK/tunnel.log"

# ─── ចុះทะเบียน URL ទៅ website (ដូច្នេះមិនត្រូវ paste អ្វីទាំងអស់) ─────────────
SITE_URL="${BUFFY_SITE_URL:-https://buffy-ai.onrender.com}"
register_url() {
  curl -fsS -m 20 -X POST "$SITE_URL/api/register" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$PUBLIC_URL\",\"key\":\"${TUNNEL_TOKEN:-}\"}" >/dev/null 2>&1
}
if register_url; then
  ok "បានចុះทะเบียนទៅ $SITE_URL — website ភ្ជាប់ស្វ័យប្រវត្តិ"
else
  warn "ចុះทะเบียนស្វ័យប្រវត្តិមិនបាន — បើក $PUBLIC_URL ដោយផ្ទាល់ក៏បាន"
fi
# keep-alive៖ រាល់ ៦០ វិនាទី (បើ site restart វាដឹង URL ថ្មីវិញ)
( while :; do sleep 60; register_url || true; done ) >/dev/null 2>&1 &

printf '\n\033[1;32m%s\033[0m\n' "════════════════════════════════════════════════════════════════"
printf '\033[1;32m🎨 បង្កើតរូបភាពរួចរាល់\033[0m\n\n'
printf '   Model : \033[1m%s\033[0m\n' "$LABEL"
printf '   URL   : \033[1m%s\033[0m\n' "$PUBLIC_URL"
printf '\033[1;32m%s\033[0m\n' "════════════════════════════════════════════════════════════════"
printf '   website ភ្ជាប់ស្វ័យប្រវត្តិ — មិនត្រូវ paste អ្វីទាំងអស់។\n'
printf '   បើក \033[1m%s\033[0m → ចំណុច \033[1;34mខៀវ\033[0m នឹងឡើងឯង\n' "$SITE_URL"
printf '   រួចបើក «🎨 បង្កើតរូបភាព» → សរសេរ prompt → ផ្ញើ\n\n'
printf '\033[1;33m⚠️  កុំបិទ cell នេះ — កម្មវិធីរត់ពេល cell នៅរត់។\033[0m\n'

while :; do sleep 30; done
