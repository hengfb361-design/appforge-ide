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
#   ៤. បើក ComfyUI + tunnel សាធារណៈ
#   ៥. បង្ហាញ URL → បើកក្នុង browser រួចបង្កើតរូបភាព
#
# ជម្រើស model (env BUFFY_IMAGE_MODEL)៖
#   fp8_hq   = qwen_image_fp8_hq.safetensors 22.7GB + TE 9.4GB  (គុណភាពខ្ពស់បំផុត) [default]
#   int8_2_1 = Qwen-Image-2.1 int8 7.3GB + TE 6.3GB             (ស្រាល សម T4 16GB)
#
# ចំណាំ៖ T4 មាន VRAM 16GB < 22.7GB → script ប្រើ --lowvram ដោយស្វ័យប្រវត្តិ
# (offload ទៅ RAM)។ ការបង្កើតរូបនឹងយឺត (រាល់រូប ~2-8 នាទី) — ធម្មតាសម្រាប់ fp8 លើ T4។

set -euo pipefail

RAW_BASE="${BUFFY_RAW_BASE:-https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main}"
WORK="${BUFFY_HOME:-/kaggle/working/buffy-image}"
PORT="${PORT:-8188}"

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

# ─── ២/៥  ជ្រើស model + ពិនិត្យ disk ─────────────────────────────────────────
say "២/៥  ជ្រើស model និងពិនិត្យទំហំ disk"
MODEL_CHOICE="${BUFFY_IMAGE_MODEL:-fp8_hq}"

# repo | file | size GB — តម្លៃពិតពី Hugging Face
case "$MODEL_CHOICE" in
  fp8_hq)
    DM_REPO="Comfy-Org/Qwen-Image";  DM_FILE="split_files/diffusion_models/qwen_image_fp8_hq.safetensors";   DM_GB=23
    TE_REPO="Comfy-Org/Qwen-Image";  TE_FILE="split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"; TE_GB=10
    VA_REPO="Comfy-Org/Qwen-Image";  VA_FILE="split_files/vae/qwen_image_vae.safetensors";                    VA_GB=1
    LABEL="Qwen-Image fp8_hq (គុណភាពខ្ពស់បំផុត)" ;;
  int8_2_1)
    DM_REPO="Comfy-Org/Qwen-Image-2.1"; DM_FILE="diffusion_models/qwen_image_2.1_int8_convrot.safetensors";        DM_GB=8
    TE_REPO="Comfy-Org/Qwen-Image-2.1"; TE_FILE="text_encoders/qwen3vl_8b_w4a8.safetensors";                       TE_GB=7
    VA_REPO="Comfy-Org/Qwen-Image-2.1"; VA_FILE="vae/qwen_image_2.1_vae_bf16.safetensors";                          VA_GB=1
    LABEL="Qwen-Image-2.1 int8 (ស្រាល — សម T4)" ;;
  *) die "BUFFY_IMAGE_MODEL មិនស្គាល់: $MODEL_CHOICE (ប្រើ fp8_hq ឬ int8_2_1)" ;;
esac

NEED_GB=$(( DM_GB + TE_GB + VA_GB + 6 ))   # +6GB សម្រាប់ ComfyUI/venv/cache
mkdir -p "$MODELS_DIR" "$WORK" || die "បង្កើត $MODELS_DIR មិនបាន"

FREE_GB=$(df -BG --output=avail "$MODELS_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
FREE_GB=${FREE_GB:-0}
echo "   model  : $LABEL"
echo "   ត្រូវការ: ~${NEED_GB}GB   ទំនេរ: ${FREE_GB}GB   (ទីតាំង: $MODELS_DIR)"

if [ "$FREE_GB" -lt "$NEED_GB" ]; then
  warn "disk មិនគ្រប់!"
  echo "   ដំណោះស្រាយ ១ — ប្រើ model ស្រាលជាង (សម T4 16GB ផងដែរ)៖"
  echo "   !BUFFY_IMAGE_MODEL=int8_2_1 bash /kaggle/working/buffy-image-start.sh"
  echo "   ដំណោះស្រាយ ២ — បង្កើន disk៖ Kaggle → Settings → 'Clear working directory' រួច run ម្តងទៀត"
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

# ─── ៥/៥  បើក ComfyUI + tunnel ─────────────────────────────────────────────
say "៥/៥  បើក ComfyUI និង tunnel សាធារណៈ"

LOWVRAM_FLAG=""
if [ "$VRAM_GIB" -lt "$DM_GB" ]; then
  LOWVRAM_FLAG="--lowvram"
  warn "VRAM ${VRAM_GIB}GB < model ${DM_GB}GB → ប្រើ --lowvram (យឺត តែដំណើរការ)"
fi

cleanup() {
  trap - INT TERM EXIT
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  pkill -f "ComfyUI/main.py" 2>/dev/null || true
  printf '\n\033[1;33m🔌 បានបិទ ComfyUI និង tunnel។\033[0m\n'
}
trap cleanup INT TERM EXIT

nohup python3 main.py --listen 127.0.0.1 --port "$PORT" \
  --extra-model-paths-config "$WORK/extra_model_paths.yaml" \
  $LOWVRAM_FLAG >"$WORK/comfy.log" 2>&1 </dev/null &

ready=""
for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:$PORT/system_stats" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || die "ComfyUI មិនឡើង — សូមមើល $WORK/comfy.log"
ok "ComfyUI ដំណើរការ"

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

printf '\n\033[1;32m%s\033[0m\n' "════════════════════════════════════════════════════════════════"
printf '\033[1;32m🎨 បង្កើតរូបភាពរួចរាល់\033[0m\n\n'
printf '   Model : \033[1m%s\033[0m\n' "$LABEL"
printf '   URL   : \033[1m%s\033[0m\n' "$PUBLIC_URL"
printf '\033[1;32m%s\033[0m\n' "════════════════════════════════════════════════════════════════"
printf '   បើក URL ក្នុង browser → ជ្រើស template "Qwen-Image" → សរសេរ prompt → Run\n'
printf '   រូបដំបូងយឺត (load model ចូល GPU): ~2-8 នាទី លើ T4\n\n'
printf '\033[1;33m⚠️  កុំបិទ cell នេះ — កម្មវិធីរត់ពេល cell នៅរត់។\033[0m\n'

while :; do sleep 30; done
