(function () {
  'use strict';

  const G = window.AppForge;
  const $ = (sel) => document.querySelector(sel);

  const el = {
    name: $('#name'),
    pkg: $('#pkg'),
    versionName: $('#versionName'),
    versionCode: $('#versionCode'),
    url: $('#url'),
    urlWrap: $('#urlWrap'),
    description: $('#description'),
    descWrap: $('#descWrap'),
    color: $('#color'),
    templates: $('#templates'),
    swatches: $('#swatches'),
    js: $('#tJs'),
    back: $('#tBack'),
    pull: $('#tPull'),
    external: $('#tExternal'),
    dark: $('#tDark'),
    genBtn: $('#genBtn'),
    zipBtn: $('#zipBtn'),
    hint: $('#hint'),
    filesCard: $('#filesCard'),
    fileTree: $('#fileTree'),
    fileCode: $('#fileCode'),
    fileCount: $('#fileCount'),
    copyAll: $('#copyAll'),
    screen: $('#screen'),
    appBar: $('#appBar'),
    barTitle: $('#barTitle'),
    screenBody: $('#screenBody'),
    summary: $('#summary'),
    snippetList: $('#snippetList'),
    verify: $('#verify'),
    autoCard: $('#autoCard'),
    repoName: $('#repoName'),
    repoPrivate: $('#repoPrivate'),
    autoBuild: $('#autoBuild'),
    buildStatus: $('#buildStatus')
  };

  const state = { template: 'webview', result: null, activeFile: 0, zipUrl: null,
    auto: { repo: '', busy: false, timer: null } };
  const STORE = 'appforge.v1';

  /* ------------------------------- templates ------------------------------- */

  G.TEMPLATES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tpl' + (t.id === state.template ? ' on' : '');
    b.dataset.id = t.id;
    b.innerHTML = '<span class="ico">' + t.icon + '</span><span><b>' + t.label + '</b><small>' + t.desc + '</small></span>';
    b.addEventListener('click', () => {
      state.template = t.id;
      [...el.templates.children].forEach((n) => n.classList.toggle('on', n.dataset.id === t.id));
      syncTemplateUi();
      generate();
    });
    el.templates.appendChild(b);
  });

  function syncTemplateUi() {
    const webview = state.template === 'webview';
    el.urlWrap.hidden = !webview;
    el.descWrap.hidden = state.template !== 'desc';
    el.pull.disabled = !webview;
    el.external.disabled = !webview;
    if (!webview) {
      el.pull.checked = false;
      el.external.checked = false;
    }
  }

  /* --------------------------------- config -------------------------------- */

  function config() {
    return {
      name: el.name.value,
      pkg: el.pkg.value,
      template: state.template,
      url: el.url.value,
      description: el.description ? el.description.value : '',
      color: el.color.value,
      versionName: el.versionName.value,
      versionCode: el.versionCode.value,
      toggles: {
        js: el.js.checked,
        back: el.back.checked,
        pull: el.pull.checked,
        external: el.external.checked,
        dark: el.dark.checked
      }
    };
  }

  function saveForm() {
    try {
      localStorage.setItem(STORE, JSON.stringify(config()));
    } catch (e) {
      /* quota or private mode: not fatal */
    }
  }

  function loadForm() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (c.name) el.name.value = c.name;
      if (c.pkg) el.pkg.value = c.pkg;
      if (c.url) el.url.value = c.url;
      if (c.description && el.description) el.description.value = c.description;
      if (c.color) el.color.value = c.color;
      if (c.versionName) el.versionName.value = c.versionName;
      if (c.versionCode) el.versionCode.value = c.versionCode;
      if (c.template && G.TEMPLATES.some((t) => t.id === c.template)) state.template = c.template;
      const t = c.toggles || {};
      if (typeof t.js === 'boolean') el.js.checked = t.js;
      if (typeof t.back === 'boolean') el.back.checked = t.back;
      if (typeof t.pull === 'boolean') el.pull.checked = t.pull;
      if (typeof t.external === 'boolean') el.external.checked = t.external;
      if (typeof t.dark === 'boolean') el.dark.checked = t.dark;
      [...el.templates.children].forEach((n) => n.classList.toggle('on', n.dataset.id === state.template));
    } catch (e) {
      /* bad json: ignore */
    }
  }

  /* -------------------------------- generate ------------------------------- */

  function generate() {
    const cfg = config();
    const result = G.build(cfg);
    state.result = result;
    state.activeFile = 0;
    state.zipUrl = null;
    el.zipBtn.disabled = false;
    el.filesCard.hidden = false;
    renderSummary(result);
    renderVerify(result);
    renderPreview(result);
    renderTree(result);
    renderCode(0);
    syncTemplateUi();
    saveForm();
  }

  function renderSummary(result) {
    const c = result.config;
    const tpl = G.TEMPLATES.find((t) => t.id === c.template);
    let html =
      '<b>' + esc(c.name) + '</b> · ' + esc(tpl.label) + '<br>' +
      esc(c.pkg) + ' · v' + esc(c.versionName) + '<br>' +
      result.files.length + ' ឯកសារ · APK តាម GitHub Actions';
    if (result.found && result.found.length) {
      html += '<div class="chips">' + result.found.map((f) => '<span class="chip">' + esc(f) + '</span>').join('') + '</div>';
    }
    el.summary.innerHTML = html;
  }

  /* ---------------------------- self-check + APK ---------------------------- */
  function renderVerify(result) {
    const check = G.verify(result);
    if (el.verify) {
      el.verify.innerHTML = check.ok
        ? '<span class="ok">✅ Self-check ជាប់ · ០ បញ្ហា</span>'
        : '<div class="bad"><b>⚠️ Self-check ឃើញ ' + check.issues.length + ' បញ្ហា</b><ul>' +
          check.issues.slice(0, 8).map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></div>';
    }
    el.zipBtn.disabled = !check.ok;
    el.autoBuild.disabled = !check.ok || state.auto.busy;
    return check;
  }

  function setBuild(html) {
    if (el.buildStatus) el.buildStatus.innerHTML = html;
  }

  function repoSlug() {
    const raw = (el.repoName.value || '').trim();
    const base = raw || (state.result ? state.result.config.pkg.split('.').pop() : 'app');
    return base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'app';
  }

  function autoBuild() {
    if (!state.result || state.auto.busy) return;
    state.auto.busy = true;
    el.autoBuild.disabled = true;
    setBuild('🚀 កំពុងបង្កើត repo នៅ GitHub…');
    const body = {
      repo: repoSlug(),
      private: el.repoPrivate.value === '1',
      files: state.result.files.map((f) => ({ path: f.path, text: f.text }))
    };
    fetch('/api/appforge/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((res) => res.json().catch(() => ({})).then((d) => ({ res: res, d: d })))
      .then((r) => {
        if (!r.res.ok) throw new Error(r.d.detail || ('HTTP ' + r.res.status));
        state.auto.repo = r.d.repo;
        setBuild('⏳ កំពុង build APK… <a href="' + esc((r.d.url || '') + '/actions') + '" target="_blank" rel="noopener">មើល Actions</a>');
        pollBuild();
      })
      .catch((err) => {
        setBuild('⚠️ ' + esc(err.message || String(err)));
        state.auto.busy = false;
        el.autoBuild.disabled = false;
      });
  }

  function pollBuild() {
    clearTimeout(state.auto.timer);
    state.auto.timer = setTimeout(() => {
      fetch('/api/appforge/status?repo=' + encodeURIComponent(state.auto.repo), { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d.state === 'done' && d.apk_ready) {
            setBuild('✅ APK រួចរាល់ — <a href="/api/appforge/apk?repo=' +
              encodeURIComponent(state.auto.repo) + '">⬇️ ទាញយក app-debug.apk</a>');
            state.auto.busy = false;
            el.autoBuild.disabled = false;
            return;
          }
          if (d.state === 'failed') {
            setBuild('❌ build មិនជោគជ័យ — <a href="' + esc(d.run_url || '#') +
              '" target="_blank" rel="noopener">មើល log</a>');
            state.auto.busy = false;
            el.autoBuild.disabled = false;
            return;
          }
          setBuild('⏳ ' + (d.state === 'starting' || d.state === 'unknown' ? 'ចាប់ផ្តើម…' : 'កំពុង build…') +
            (d.run_url ? ' <a href="' + esc(d.run_url) + '" target="_blank" rel="noopener">Actions</a>' : ''));
          pollBuild();
        })
        .catch(() => {
          state.auto.timer = setTimeout(pollBuild, 8000);
        });
    }, 9000);
  }

  if (el.autoBuild) el.autoBuild.addEventListener('click', autoBuild);
  if (el.autoCard) el.autoCard.hidden = false;
  fetch('/api/appforge/ready', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      if (!d || !d.github) {
        el.autoBuild.disabled = true;
        setBuild('⚠️ Server មិនទាន់មាន <b>GITHUB_TOKEN</b> — បន្ថែមក្នុង Render → Environment រួច reload');
      } else {
        setBuild('រួចរាល់ — ចុច “🚀 បង្កើត APK” ខាងលើ');
      }
    })
    .catch(() => setBuild('— ប្រើ ZIP + GitHub ដោយដៃបានធម្មតា'));

  function renderPreview(result) {
    const c = result.config;
    el.appBar.style.background = c.color;
    el.barTitle.textContent = c.name;
    el.screenBody.innerHTML = '';
    if (c.template === 'webview') {
      el.screenBody.innerHTML =
        '<div class="web">' +
        '<div class="bar"></div><div class="bar short"></div><div class="bar"></div>' +
        '<div style="font-size:10px;color:#6f8199;margin-top:4px">' + esc(c.url.replace(/^https?:\/\//, '')) + '</div>' +
        '</div>';
    } else if (c.template === 'notes') {
      el.screenBody.innerHTML =
        '<div class="notes">' +
        '<div class="note">សរសេរកំណត់ត្រា #1</div>' +
        '<div class="note">សរសេរកំណត់ត្រា #2</div>' +
        '<div class="note">សូមចុចឱ្យយូរដើម្បីលុប</div>' +
        '</div>';
    } else {
      el.screenBody.innerHTML =
        '<div style="display:grid;gap:6px;place-items:center">' +
        '<div style="font-size:13px;font-weight:700;color:#e8f0fb">' + esc(c.name) + '</div>' +
        '<div style="font-size:11px">អ្នកចុច 0 ដង</div>' +
        '<div style="background:' + esc(c.color) + ';color:#04231b;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700">ចុចទីនេះ</div>' +
        '</div>';
    }
  }

  function renderTree(result) {
    el.fileTree.innerHTML = '';
    el.fileCount.textContent = result.files.length;
    result.files.forEach((f, i) => {
      const li = document.createElement('li');
      li.textContent = f.path;
      if (i === state.activeFile) li.classList.add('on');
      li.addEventListener('click', () => renderCode(i));
      el.fileTree.appendChild(li);
    });
  }

  function renderCode(index) {
    const files = state.result ? state.result.files : [];
    const file = files[index];
    if (!file) {
      el.fileCode.textContent = '—';
      return;
    }
    state.activeFile = index;
    el.fileCode.textContent = file.text;
    [...el.fileTree.children].forEach((li, i) => li.classList.toggle('on', i === index));
    el.fileCode.parentElement.scrollTop = 0;
  }

  /* -------------------------------- download ------------------------------- */

  function buildZip() {
    if (!state.result) return null;
    if (state.zipUrl) return state.zipUrl;
    const bytes = G.zip(state.result.files);
    const blob = new Blob([bytes], { type: 'application/zip' });
    state.zipUrl = URL.createObjectURL(blob);
    return state.zipUrl;
  }

  el.zipBtn.addEventListener('click', () => {
    const url = buildZip();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.result.config.pkg.split('.').pop() || 'app') + '-android.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    el.hint.textContent = '✅ ទាញយករួច — សូមអាន README.md ខាងក្នុងសម្រាប់ជំហានបន្ទាប់។';
  });

  el.copyAll.addEventListener('click', () => {
    const file = state.result && state.result.files[state.activeFile];
    if (!file) return;
    copy(file.text, el.copyAll, '⧉ ចម្លងកូដឯកសារនេះ');
  });

  function copy(text, btn, label) {
    const done = () => {
      btn.textContent = '✓ ចម្លងរួច';
      setTimeout(() => (btn.textContent = label), 1300);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
    } else {
      fallback(text, done);
    }
  }

  function fallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    done();
  }

  /* -------------------------------- snippets ------------------------------- */

  G.SNIPPETS.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'card snippet';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = s.code;
    pre.appendChild(code);
    const btn = document.createElement('button');
    btn.className = 'ghost small';
    btn.textContent = '⧉ ចម្លង';
    btn.addEventListener('click', () => copy(s.code, btn, '⧉ ចម្លង'));
    card.innerHTML = '<h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p>';
    card.appendChild(pre);
    card.appendChild(btn);
    el.snippetList.appendChild(card);
  });

  /* ---------------------------------- tabs --------------------------------- */

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab.dataset.view));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* -------------------------------- handlers ------------------------------- */

  el.genBtn.addEventListener('click', generate);
  [el.name, el.pkg, el.url, el.description, el.color, el.versionName, el.versionCode,
   el.js, el.back, el.pull, el.external, el.dark].forEach((node) => {
    node.addEventListener('input', () => {
      if (!state.result) return;
      const result = G.build(config());
      state.result = result;
      state.zipUrl = null;
      renderSummary(result);
      renderPreview(result);
      saveForm();
    });
  });

  el.swatches.addEventListener('click', (ev) => {
    const c = ev.target.closest('button[data-color]');
    if (!c) return;
    el.color.value = c.dataset.color;
    if (state.result) {
      state.result = G.build(config());
      state.zipUrl = null;
      renderPreview(state.result);
      renderSummary(state.result);
    }
    saveForm();
  });

  el.name.addEventListener('input', () => {
    if (!el.pkg.value || el.pkg.dataset.auto !== 'off') {
      el.pkg.value = G.normalize({ name: el.name.value, pkg: '' }).pkg;
    }
  });
  el.pkg.addEventListener('input', () => {
    el.pkg.dataset.auto = 'off';
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  /* ---------------------------------- init --------------------------------- */

  loadForm();
  if (!el.name.value) el.name.value = 'App ថ្មីរបស់ខ្ញុំ';
  if (!el.pkg.value) el.pkg.value = G.normalize({ name: el.name.value }).pkg;
  syncTemplateUi();
  generate();
})();
