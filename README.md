# ✦ Buffy AI — Chatbot ស្ទីល GPT ដែលរត់ local ក្នុង Google Colab

កម្មវិធីជជែក AI ដែលរត់ **ម៉ូដែល open-source (Qwen GGUF)** នៅលើ GPU របស់ Google Colab
ហើយបង្កើត **link សាធារណៈ** សម្រាប់ជជែកពីទូរស័ព្ទ ឬកុំព្យូទ័រណាមួយ។

- ❌ គ្មាន Gemini, គ្មាន API key, គ្មានការចំណាយ
- ✅ ម៉ូដែលរត់ក្នុង Colab ផ្ទាល់ (ទិន្នន័យមិនចេញទៅខាងក្រៅ)
- ✅ UI ស្ទីល GPT៖ dark theme, streaming, Markdown + code block មាន copy, ភ្ជាប់ប្រវត្តិ, ទាញយក, ប្រើបានលើទូរស័ព្ទ

> ⚠️ ដែនកំណត់៖ ម៉ូដែល local ជា **text-only** — មិនអានរូបភាព, គ្មាន web search, គ្មានបង្កើតរូបភាព។

## ឯកសារ

| ឯកសារ | តួនាទី |
|---|---|
| `Qwen_Code_Colab.ipynb` | Notebook សម្រាប់ Colab៖ ដំឡើង engine, ទាញយក GGUF, បើក UI + link |
| `local_app.py` | Server៖ បម្រើ UI និង proxy streaming ទៅ engine OpenAI-compatible (Ollama / llama.cpp) |
| `ui.py` | UI HTML/CSS/JS តែមួយ (គ្មាន build step) |
| `build_notebooks.py` | បង្កើត notebook ឡើងវិញពីកូដ (`python build_notebooks.py`) |
| `push_to_github.sh` | រុញ project ទៅ GitHub ដោយពាក្យបញ្ជាតែមួយ |

Repo៖ https://github.com/hengfb361-design/buffy-ai

## ផ្លូវលឿនបំផុត — បន្ទាត់តែមួយ (គ្មាន notebook)

ក្នុង Colab cell ថ្មី សរសេរបន្ទាត់នេះ **ទាំង `!` នៅដើម** (បើអត់ `!` វាចេញ `SyntaxError: invalid syntax`)៖

```bash
!curl -fsSL -o /content/buffy-start.sh https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main/colab-start.sh && bash /content/buffy-start.sh
```

> បើ GitHub ត្រូវបានបិទ/យឺត មាន mirror ដូចគ្នានៅ Freebuff Sites៖
> `!curl -fsSL -o /content/buffy-start.sh https://site-0cca59b7138a4d9a8ddbbdb1cedf34b7.freebuff.page/colab-start.sh && bash /content/buffy-start.sh`

វានឹងធ្វើអ្វីៗទាំងអស់ដោយស្វ័យប្រវត្តិ៖

1. ដំឡើង **Ollama** (បើគ្មាន) និងបើក engine
2. ទាញយក **Qwen2.5-Coder-7B-Instruct-abliterated** `Q4_K_M` (~4.7 GB, ទាញបន្តបាន)
3. `ollama create qwen2.5-coder-7b-abliterated`
4. បើក API (`local_app.py`) + tunnel សាធារណៈ
5. បង្ហាញ **URL** និង **API key** — រួច paste ចូល website → sidebar → **Colab**

> បើអ្នកចង់ប្តូរម៉ូដែល/key ដោយខ្លួនឯង បន្ថែម env មុនពេលរត់ ឧ៖
> `!BUFFY_MODEL_TAG=my-model BUFFY_ACCESS_KEY=mykey bash /content/buffy-start.sh`
> (ឬដាក់ `BUFFY_ACCESS_KEY` / `EXA_API_KEY` ក្នុង Colab 🔑 Secrets)

> script ទាញ `local_app.py` និង `ui.py` ពី branch `main` ដូចគ្នា — ដូច្នេះបើអ្នកកែ server
> ត្រូវ push សិន។ Mirror (Freebuff Sites) មានឯកសារដូចគ្នានិងដំណើរការដូចគ្នា។

## Kaggle — បង្កើតរូបភាព (Qwen-Image 22.7GB)

Kaggle cell ថ្មី (មាន `!` ដើម)៖

```bash
!curl -fsSL -o /kaggle/working/buffy-image-start.sh https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main/kaggle-start.sh && bash /kaggle/working/buffy-image-start.sh
```

ជ្រើស **Settings → Accelerator → GPU T4 x2** សិន។ Script ដំឡើង **ComfyUI**, ទាញយក model
ទៅ `/kaggle/temp` (ព្រោះ `/kaggle/working` មានតែ ~20GB), រួចបើក tunnel សាធារណៈ។

| ជម្រើស | ឯកសារ | ទំហំ | សម្រាប់ |
|---|---|---|---|
| `fp8_hq` (default) | `qwen_image_fp8_hq.safetensors` | 22.7 GB + TE 9.4 GB | គុណភាពខ្ពស់បំផុត |
| `int8_2_1` | `qwen_image_2.1_int8_convrot.safetensors` | 7.3 GB + TE 6.3 GB | T4 16GB ស្រាល/លឿន |

```bash
# model ស្រាល (ណែនាំសម្រាប់ T4 16GB)
!BUFFY_IMAGE_MODEL=int8_2_1 bash /kaggle/working/buffy-image-start.sh
```

> ⚠️ **T4 មាន VRAM 16GB < model 22.7GB** → script ប្រើ `--lowvram` (offload ទៅ RAM 29GB)
> ដោយស្វ័យប្រវត្តិ។ វាដំណើរការ តែរាល់រូបយឺត ~2–8 នាទី។ ចង់លឿន → ប្រើ `int8_2_1` (7.3GB ចូល VRAM)។

## របៀបប្រើតាម notebook

1. បើក https://colab.research.google.com → **Upload** `Qwen_Code_Colab.ipynb`
2. `Runtime → Change runtime type → T4 GPU`
3. រត់ cell **1️⃣ ដំឡើង** → **2️⃣ ទាញយកម៉ូដែល** → **3️⃣ បើក UI**
4. cell **3️⃣** បង្ហាញ `URL` និង `API key` — ប្រើមួយក្នុងចំណោមពីរនេះ៖
   - បើក URL នោះផ្ទាល់ ហើយជជែក (UI តែមួយ គ្មាន key ត្រូវការ ព្រោះជា same-origin)
   - ឬប្រើ website សាធារណៈ (ឧ. `ai.onrender.com`) → **sidebar → Colab** → paste `URL` និង `API key`
     រួចចុច **🔌 ភ្ជាប់ និងសាកល្បង**

### ការតភ្ជាប់ពី website សាធារណៈ (URL + API key)

Render គ្មាន GPU ដូច្នេះ website ត្រូវហៅម៉ូដែលដែលរត់ក្នុង Colab៖

1. Colab cell **3️⃣** បង្ហាញពីរបន្ទាត់៖ `URL : https://…trycloudflare.com` និង `API key : …`
2. ក្នុង website បើក sidebar → **Colab** (ក្រោមជម្រើសម៉ូដែល)
3. paste បន្ទាត់ណាមួយ — ប្រព័ន្ធស្រង់ `URL` និង `API key` ដាក់ឲ្យខ្លួនឯង — រួចចុច **🔌 ភ្ជាប់ និងសាកល្បង**
4. បើឃើញ ✅ បានភ្ជាប់ សារទាំងអស់នឹងទៅម៉ូដែលក្នុង Colab ផ្ទាល់

- `URL` និង `API key` រក្សាទុកតែក្នុង `localStorage` របស់ browser នោះ — មិនឡើងទៅ server ណាមួយឡើយ
- ដកចេញវិញ៖ លុប URL ចោល → ចុច **ភ្ជាប់ និងសាកល្បង** → ត្រឡប់ទៅ server របស់ website វិញ
- `API key` បង្កើតដោយ Colab (ឬដាក់ `BUFFY_ACCESS_KEY` ក្នុង Colab 🔑 Secrets ដើម្បីកំណត់ខ្លួនឯង)។
  Server ត្រូវការ key នេះតែពេលហៅពី origin ដទៃ (ឧ. website លើ Render) — page ដែល Colab
  បើកផ្ទាល់ នៅតែប្រើបានដោយគ្មាន key
- CORS ត្រូវបានបើកនៅ `/api/*` ដើម្បីឲ្យ browser ហៅ tunnel ដោយផ្ទាល់ (គ្មាន cookie ត្រូវបានប្រើ)

### ម៉ូដែលដែលអាចជ្រើស (ទំហំពិតពី Hugging Face)

| ជម្រើស | ទំហំ | កំណត់សម្គាល់ |
|---|---|---|
| `auto` (**default**) | — | script រើស model ធំបំផុតដែល GPU ទ្រាំបាន |
| `coder32b` | **19.9 GB** | Qwen2.5-Coder-32B `Q4_K_M` — «model 20GB», ឆ្លាតបំផុត; ត្រូវ A100 40GB / L4 24GB |
| `coder30b` | 13.3 GB | Qwen3-Coder-30B-A3B `Q3_K_S` — MoE 3B active → **លឿន ហើយឆ្លាត**; សម្រាប់ T4 16GB |
| `coder7b_ablit` | 4.7 GB | Qwen2.5-Coder-7B **abliterated** `Q4_K_M` — លឿន; គ្មានការបដិសេធរំខាន |
| `coder3b_ablit` | 1.9 GB | Qwen2.5-Coder-3B **abliterated** `Q4_K_M` — លឿនបំផុត / គ្មាន GPU |
| `qwen38b` | 5.0 GB | Qwen3-8B `Q4_K_M` |
| `qwen38_27b` | 12.0 GB | Qwen3.8-27B `UD-IQ3_S` — dense 27B → យឺតជាង |
| `coder7b` | 4.7 GB | Qwen2.5-Coder-7B `Q4_K_M` (មិន abliterated) |

> បញ្ជាដោយខ្លួនឯង៖ `BUFFY_MODEL=coder32b bash /content/buffy-start.sh` ឬក្នុង notebook
> ប្តូរ dropdown `MODEL_CHOICE`។ ចង់បាន model 20GB លើ Colab → `Runtime → Change runtime type → A100`។

> ម៉ូដែល abliterated គឺយក refusal direction ចេញពី weights — វាមិនមែនជាការបន្ថែមសមត្ថភាពទេ
> តែវាបន្ថយការបដិសេធដែលមិនចាំបាច់។ អ្នកនៅទទួលខុសត្រូវលើអ្វីដែលអ្នកសួរ និងផលដែលបានមក។
> GGUF មកពី `bartowski/Qwen2.5-Coder-7B-Instruct-abliterated-GGUF`។

> **Qwen3.8-2.4T-A95B មិនអាចរត់ក្នុង Colab បានទេ**៖ weights ដើម ~4.9 TB,
> GGUF តូចបំផុត ~397 GB, ត្រូវការ RAM/VRAM ~410 GB+. Colab មាន RAM 12–50 GB
> និង disk ~100 GB។ នេះជាដែនកំណត់ hardware មិនមែនបញ្ហា link ទេ។

## រត់ក្នុងម៉ាស៊ីនផ្ទាល់ខ្លួន (ស្រេចចិត្ត)

```bash
pip install fastapi uvicorn requests
# engine ណាមួយដែលជា OpenAI-compatible ក៏បាន (Ollama ងាយបំផុត)
ollama serve
ollama create buffy-coder -f Modelfile
LLAMA_URL=http://127.0.0.1:11434 LOCAL_MODEL=buffy-coder \
  uvicorn local_app:app --host 127.0.0.1 --port 8000
```

## ការតភ្ជាប់ API key (server-side)

Website/`local_app.py` អាចប្រើ backend ពីរ — **key អានតែនៅ server, មិនដែលឆ្លងកាត់ browser**៖

| Env var | តួនាទី | ដាក់នៅឯណា |
|---|---|---|
| `API_BASE_URL` | base URL របស់ API ពិត (OpenAI-compatible) ឧ. `https://api.example.com/v1` | Sites → Secrets ឬ env |
| `API_KEY` | bearer key សម្រាប់ API នោះ | **Sites → Secrets** (ឬ Colab 🔑 Secrets) |
| `API_MODEL` | model id សម្រាប់ API នោះ | Sites → Secrets ឬ env |
| `LLAMA_URL` | engine local (Ollama / llama.cpp) — ប្រើពេល `API_BASE_URL` ទទេ | env |
| `LOCAL_MODEL` | model id នៅក្នុង engine local | env |
| `EXA_API_KEY` | **web search** សម្រាប់បង្ហាញប្រភព (Exa) — គ្មាន key = search បិទ | Sites → Secrets / Colab 🔑 Secrets |
| `ACCESS_KEY` | key ដែល Colab បង្ហាញ សម្រាប់ឲ្យ website ខាងក្រៅហៅមក (គ្មាន = គ្មានការការពារ) | Colab cell **3️⃣** កំណត់ដោយស្វ័យប្រវត្តិ |

- **មិនកំណត់** `API_BASE_URL` → ប្រើ engine local (`LLAMA_URL`) ដូចមុន
- **កំណត់** `API_BASE_URL` → ប្រើ API ពិត, `API_KEY` បញ្ជូនជា `Authorization: Bearer …` (តែនៅ server)
- `/api/health` រាយ `key_set: true/false` និង `web_search: "exa"|"off"` តែ **មិនបញ្ចេញតម្លៃ key** ទេ

### Web search (បង្ហាញប្រភព)

បើក toggle **🌐 ស្វែងរកអ៊ីនធឺណិត** ក្នុង sidebar → server ស្វែងរក ហើយ៖
- បង្ហាញ **chips ប្រភព** ចុចបានក្រោមចម្លើយ
- បញ្ចូលលទ្ធផល ៥ ដំបូង (title + URL + snippet) ក្នុង context ដើម្បីឲ្យម៉ូដែលដកស្រង់
- គ្មាន `EXA_API_KEY` → ប្រាប់ជាសារ រួចឆ្លើយធម្មតាបន្ត (មិន crash)
- គ្មាន `"type": "auto"`, គ្មានការបរាជ័យ → បញ្ជូន HTTP status ជាសារ

> Search API ឥតគិតថ្លៃ៖ Exa (≈2,800 searches ដំបូង + $10/ខែ គ្មានកាត)។ ទោះជាយ៉ាងណា កូដនេះក៏ទទួល
> endpoint ណាមួយដែលគាំទ្រ `POST …/search` + `Authorization: Bearer` បានដែរ។

> ⛔ កុំដាក់ key ក្នុងកូដ, `.env` ដែល commit, URL ឬ input box ក្នុង browser។
> បើ key ធ្លាយ (ឧ. paste ក្នុង chat) → revoke/regenerate ភ្លាម។

## Deploy ទៅ Render (website អចិន្ត្រៃយ៍)

Repo នេះ deploy ទៅ [Render](https://dashboard.render.com) បានដោយគ្មាន Docker — ត្រូវការតែ ៣ ក្រណាត់នៅ **New → Web Service** (ជ្រើស repo នេះ)៖

| Field | តម្លៃ |
|---|---|
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn local_app:app --host 0.0.0.0 --port $PORT` |

> `requirements.txt` ត្រូវបាន commit ក្នុង repo (fastapi, uvicorn, requests) — ដោយសារតែ repo អត់មានវា
> Render error `Module "local_app" not found` / `No module named …`

Env vars នៅ **Environment** tab របស់ service (មិនចាំបាច់សម្រាប់ local Colab mode ទេ)៖

- `API_BASE_URL` + `API_KEY` + `API_MODEL` → ឆ្លើយពី API ពិត (គ្មាន GPU លើ Render ទេ)
- `EXA_API_KEY` → web search បង្ហាញប្រភព

> Render ឥតគិតថ្លៃ **sleep បន្ទាប់ពី ១៥ នាទី idle** — ការសួរដំបូងប្រហែល ៥០វិនាទី យឺត រួចប្រក្នុងល្បឿនធម្មតា។

## Push ទៅ GitHub

```bash
./push_to_github.sh https://github.com/<username>/<repo>.git
```

## សុវត្ថិភាព

- Repo នេះគ្មាន key ឬ token ណាមួយទេ — ហើយមិនត្រូវបន្ថែមវាឡើយ
- link `trycloudflare.com` ជាសាធារណៈ៖ អ្នកណាមាន link អាចប្រើ GPU/ម៉ូដែលរបស់អ្នក — កុំបង្ហោះជាសាធារណៈ
- បើ token/key ធ្លាយចេញ (ឧ. paste ក្នុង chat) សូម revoke/regenerate ភ្លាម

## ការប្រើប្រាស់ប្រកបដោយក្រមសីលធម៌

Project នេះមិនកំណត់បំពាន (jailbreak) ដើម្បីបំបែកគោលការណ៍សុវត្ថិភាពរបស់ម៉ូដែលឡើយ។
សម្រាប់ការរៀនសុវត្ថិភាព សូមប្រើ lab ស្របច្បាប់ (TryHackMe, HackTheBox, DVWA)
និងប្រព័ន្ធដែលអ្នកមានសិទ្ធិសាកល្បងជាលាយលក្ខណ៍អក្សរ។

## License

MIT

## AppForge IDE (ថ្មី — IDE ក្នុង browser)

Root `/` ឥឡូវជា IDE ពេញលេញ (មិនមែន form តែមួយទេ)។ ទំព័រចាស់ៗនៅដដែល៖

| URL | អ្វី |
|---|---|
| `/` | **AppForge IDE** — file explorer, editor, live preview, build APK |
| `/appforge/` | ប្រអប់បង្កើត App បែបចាស់ (នៅដំណើរការដូចដើម) |
| `/buffy` | Buffy Chat ចាស់ |
| `/api/appforge/*` | build/status/apk/logs ដូចមុន (បន្ថែម `logs`) |
| `/api/ide/*` | project storage ថ្មី (create/list/file/asset/move/delete/mkdir/zip/import) |
| `/p/{project}/{key}/...` | ឯកសារសម្រាប់ sandboxed preview iframe |

### មុខងារ

- **File explorer**: បង្កើត/ប្តូរ​ឈ្មោះ/លុប ឯកសារ និងថត, upload រូប/asset, ទាញយកឯកសារមួយ, export ZIP, import ZIP
- **Editor**: លេខបន្ទាត់, syntax highlight (HTML/CSS/JS/JSON/XML/Java/Kotlin/Python/PHP/MD), auto-indent, bracket ស្វ័យប្រវត្តិ, Find/Replace, tabs ច្រើន, auto-save, Ctrl+S / Ctrl+F / Ctrl+P
- **Live preview**: iframe បំបែក (sandbox), index.html ជាចំណុចចាប់ផ្តើម, CSS/JS/រូប ផ្ទុកដោយខ្លួនឯង, បង្ហាញ JS error ក្នុង Problems, បិទ/បើក Desktop និង Mobile
- **Build APK**: ឈ្មោះ, package, version, icon (បង្កើត mipmap គ្រប់ទំហំ), permissions, orientation, offline/online
- **Templates**: Blank, Landing, Notes, Android (Kotlin) — បង្កើត project ថ្មីបានភ្លាម

### របៀប build APK ពី IDE

1. ដាក់ `GITHUB_TOKEN` ក្នុង Render → Environment (មិនត្រូវ commit ឡើយ)
2. សរសេរកូដ → ចុច **🤖 Build APK**
3. ឯកសារ web ចូល `app/src/main/assets/www/`; ឯកសារ Gradle/Java/Kotlin (`app/src/main/...`, `build.gradle`, `.github/...`) ជំនួសឯកសារដែលបង្កើតស្រាប់ → Gradle compile ពិត
4. GitHub Actions បង្កើត `app-debug.apk` → ចុច **ទាញយក APK**

### សុវត្ថិភាព និងដែនកំណត់

- Project នីមួយៗមាន id + key ចៃដន្យ; គ្រប់ API ត្រូវការ `X-Project-Key`
- Path ត្រូវបានពិនិត្យពីរដង (textual + realpath) — ការពារ `..`, absolute path, `\`, តួអក្សរហាម
- ZIP import បដិសេធ symlink, traversal, ឯកសារធំ, ចំនួនច្រើនពេក
- ដែនកំណត់: 2MB/ឯកសារ, 5MB/asset, 40MB/project, 400 ឯកសារ, 16MB/ZIP
- ទិន្នន័យរក្សាក្នុង `IDE_DATA_DIR` (លំនាំ `/tmp/appforge-ide` — បាត់ពេល Render restart); browser រក្សា snapshot ដើម្បីបង្កើតឡើងវិញ

### Deploy ទៅ Render

```bash
# ជម្រើស ១: Blueprint (render.yaml)
# New + → Blueprint → ជ្រើស repo → បន្ថែម GITHUB_TOKEN

# ជម្រើស ២: Web Service ដោយដៃ
# Runtime: Python 3.12
# Build:  pip install -r requirements.txt
# Start:  uvicorn local_app:app --host 0.0.0.0 --port $PORT
# Health: /api/health
```

> IDE ត្រូវការ Python server (មិនមែន static site ទេ) ព្រោះ preview, project storage
> និង build proxy រត់លើ FastAPI។ `/appforge/` តែម្នាក់ឯងនៅជា static បាន។
