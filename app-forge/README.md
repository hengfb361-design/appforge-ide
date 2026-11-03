# AppForge

បង្កើត **Android App ពេញលេញ** (Kotlin + Gradle) ក្នុង browser ហើយទាញយកជា ZIP។
ដាក់ ZIP នោះលើ GitHub → GitHub Actions បង្កើត `app-debug.apk` ឱ្យដោយស្វ័យប្រវត្តិ។

- គ្មាន backend គ្មាន API key គ្មាន AI — កូដបង្កើតដោយ template នៅក្នុង browser
- គ្មាន dependency ខាងក្រៅ (ZIP writer សរសេរដោយខ្លួនឯង, គ្មាន CDN)
- ៣ template: វេបសាយ → App (WebView), App ទទេ (Kotlin), App កត់ត្រា

## រចនាសម្ព័ន្ធ

```
app-forge/
  public/index.html   UI ភាសាខ្មែរ (tabs: បង្កើត App / Code / របៀប)
  public/styles.css   រចនាប័ទ្ម
  public/app.js       UI wiring (form → preview → file tree → download)
  public/gen.js       generator សុទ្ធ + ZIP writer (រត់បានទាំង browser និង Node)
  worker.js           Worker តូច: /healthz + static assets
  deploy.json         manifest សម្រាប់ Sites deploy
```

## តេស្ត

```bash
node --check public/gen.js && node --check public/app.js && node --check worker.js
node -e "const G=require('./app-forge/public/gen.js');const b=G.zip(G.build({name:'X'}).files);require('fs').writeFileSync('/tmp/a.zip',Buffer.from(b))"
unzip -t /tmp/a.zip
```

`gen.js` export តាម UMD ដូច្នេះអាច `require()` ក្នុង Node ដើម្បីតេស្ត ZIP និងខ្លឹមសារឯកសារ។

## Deploy

```bash
# manifest: app-forge/deploy.json (assetsDirectory ./public)
```
Deploy តាម Sites (`sites_deploy`) ឬ upload ថត `public/` ទៅ static host ណាមួយក៏បាន —
គ្មាន server-side logic ទេ ដូច្នេះ GitHub Pages/Netlify ក៏ដំណើរការ។
