/* AppForge IDE — project workspace, editor wiring, live preview and APK build.
   Talks only to this server: /api/ide/* for files, /p/... for the sandboxed
   preview, and the existing /api/appforge/* endpoints for GitHub builds. */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const G = window.AppForge;

  const LS = {
    proj: 'af.ide.project',
    files: 'af.ide.files',
    settings: 'af.ide.settings',
    history: 'af.ide.history',
    build: 'af.ide.build',
    langs: 'af.ide.langs'
  };

  const TEXT_EXT = ['html', 'htm', 'css', 'js', 'mjs', 'json', 'md', 'txt', 'xml',
    'kt', 'kts', 'java', 'gradle', 'properties', 'yml', 'yaml', 'py', 'php', 'svg'];

  const state = {
    proj: null,
    files: {},
    list: [],
    dirs: [],
    selectedDir: '',
    open: [],
    active: '',
    dirty: {},
    collapsed: {},
    settings: { theme: 'dark', fontSize: 13, tabSize: 2, wrap: false, auto: true, live: true, lang: 'km' },
    icon: null,
    history: [],
    build: { repo: '', url: '', timer: null, busy: false, last: null },
    previewErrors: [],
    syntaxErrors: [],
    diagEngine: '',
    langs: {},
    editor: null,
    offline: false
  };

  /* ─────────────────────────────── helpers ─────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function toast(message, kind) {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function setStatus(text, kind) {
    const el = $('#stStatus');
    el.textContent = (kind === 'err' ? '● ' : kind === 'ok' ? '● ' : '● ') + text;
    el.style.color = kind === 'err' ? 'var(--error)' : kind === 'ok' ? 'var(--success)' : '';
  }

  function ext(path) {
    return String(path || '').split('.').pop().toLowerCase();
  }

  function isText(path) {
    return TEXT_EXT.indexOf(ext(path)) >= 0;
  }

  function dirOf(path) {
    const at = String(path || '').lastIndexOf('/');
    return at < 0 ? '' : path.slice(0, at + 1);
  }

  function baseName(path) {
    return String(path || '').split('/').pop();
  }

  function saveLocal() {
    try {
      const snapshot = { proj: state.proj, list: state.list, files: {} };
      Object.keys(state.files).forEach((p) => {
        if (typeof state.files[p].text === 'string') snapshot.files[p] = state.files[p].text;
      });
      localStorage.setItem(LS.files, JSON.stringify(snapshot));
      if (state.proj) localStorage.setItem(LS.proj, JSON.stringify(state.proj));
    } catch (e) { /* quota — keep working in memory */ }
  }

  const saveLocalSoon = debounce(saveLocal, 1200);

  /* ──────────────────────────────── network ────────────────────────────── */

  async function api(path, opts) {
    const o = opts || {};
    const headers = {};
    if (state.proj && o.key !== false) headers['X-Project-Key'] = state.proj.key;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method: o.method || 'GET',
      headers: headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.detail) || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function projectApi(suffix) {
    return '/api/ide/project/' + state.proj.id + (suffix || '');
  }

  async function ensureProject() {
    if (state.proj && state.proj.id) {
      try {
        const info = await api(projectApi());
        state.proj.name = info.name || state.proj.name;
        state.list = info.files || [];
        $('#projName').value = state.proj.name;
        return true;
      } catch (err) {
        if (err.status !== 404) throw err;
        state.proj = null; // server lost it (restart): recreate below
      }
    }
    const created = await api('/api/ide/project', {
      method: 'POST', key: false, body: { name: $('#projName').value || 'គម្រោងថ្មី' }
    });
    state.proj = { id: created.id, key: created.key, name: created.name };
    state.list = [];
    return true;
  }

  /* Older versions filled every new project with the blank template. When the
     files are still byte-identical to the generated ones nobody edited them,
     so the project is turned back into the empty one the user asked for. */
  async function dropUntouchedTemplate() {
    const tpl = (TEMPLATES.blank && TEMPLATES.blank.files) || {};
    const paths = Object.keys(tpl);
    if (!paths.length || state.list.length !== paths.length) return false;
    for (const p of paths) {
      if (!state.list.some((f) => f.path === p)) return false;
      // Compare against the server's copy: a stale local snapshot must never
      // decide that an edited file looks untouched.
      let text = null;
      try {
        const r = await api(projectApi('/file') + '?path=' + encodeURIComponent(p));
        text = r.text;
      } catch (e) {
        return false;
      }
      if (text !== tpl[p]) return false;
    }
    try {
      for (const p of paths) {
        await api(projectApi('/delete'), { method: 'POST', body: { path: p } });
        delete state.files[p];
      }
    } catch (e) {
      return false; // leave the tree alone rather than claim a delete that failed
    }
    state.list = [];
    return true;
  }

  async function loadProject() {
    await ensureProject();
    const info = await api(projectApi());
    state.list = info.files || [];
    await loadMissingText();
    renderTree();
    updateStats();
    saveLocal();
  }

  async function loadMissingText() {
    const want = state.list.filter((f) => !f.binary && !state.files[f.path]);
    let i = 0;
    async function worker() {
      while (i < want.length) {
        const file = want[i++];
        try {
          const r = await api(projectApi('/file') + '?path=' + encodeURIComponent(file.path));
          state.files[file.path] = { text: r.text };
        } catch (e) { /* one bad file must not stop the rest */ }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  async function saveFile(path, opts) {
    const rec = state.files[path];
    if (!rec || typeof rec.text !== 'string') return;
    try {
      await api(projectApi('/file'), { method: 'PUT', body: { path: path, text: rec.text } });
      delete state.dirty[path];
      setDirtyDot();
      renderTabs();
      saveLocalSoon();
    } catch (err) {
      if (err.status === 404) {
        try {
          await ensureProject();
          await api(projectApi('/file'), { method: 'PUT', body: { path: path, text: rec.text } });
          delete state.dirty[path];
          setDirtyDot();
          renderTabs();
          return;
        } catch (e2) { /* fall through */ }
      }
      state.offline = true;
      toast('រក្សាទុកលើ server មិនបាន — ទុកក្នុងឧបករណ៍ជាបណ្តោះអាសន្ន', 'err');
    }
  }

  const saveSoon = debounce(() => {
    const p = state.active;
    if (p && state.dirty[p]) saveFile(p);
  }, 800);

  function setDirtyDot() {
    const any = Object.keys(state.dirty).length > 0;
    $('#saveDot').classList.toggle('dirty', any);
    $('#saveDot').title = any ? 'Unsaved changes' : 'Saved';
  }

  /* ──────────────────────────────── tree ───────────────────────────────── */

  function buildTree(list, dirs) {
    const root = { dirs: {}, files: [] };
    // Folders come from the server as well, so an empty folder stays visible.
    (dirs || []).forEach((d) => {
      let node = root;
      String(d).split('/').filter(Boolean).forEach((name) => {
        if (!node.dirs[name]) node.dirs[name] = { dirs: {}, files: [] };
        node = node.dirs[name];
      });
    });
    list.forEach((f) => {
      const parts = f.path.split('/');
      let node = root;
      parts.slice(0, -1).forEach((name) => {
        if (!node.dirs[name]) node.dirs[name] = { dirs: {}, files: [] };
        node = node.dirs[name];
      });
      node.files.push(f);
    });
    return root;
  }

  const ICONS = {
    html: '🌐', htm: '🌐', css: '🎨', js: '📜', mjs: '📜', json: '🔧', md: '📘',
    kt: '🟪', kts: '🟪', java: '☕', xml: '🧾', gradle: '🐘', png: '🖼', jpg: '🖼',
    jpeg: '🖼', webp: '🖼', gif: '🖼', svg: '🖼', txt: '📄', php: '🐘', py: '🐍'
  };

  function renderTree() {
    const root = buildTree(state.list, state.dirs);
    const sel = state.selectedDir;
    const html = [];
    function walk(node, prefix) {
      Object.keys(node.dirs).sort().forEach((name) => {
        const full = prefix + name;
        const closed = !!state.collapsed[full];
        html.push(row('dir', full, name, closed));
        if (!closed) walk(node.dirs[name], full + '/');
      });
      node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach((f) => {
        html.push(row('file', f.path, baseName(f.path), false));
      });
    }
    function row(kind, path, label, closed) {
      const icon = kind === 'dir' ? (closed ? '📁' : '📂') : (ICONS[ext(path)] || '📄');
      const on = path === state.active ? ' on' : '';
      const picked = kind === 'dir' && path === sel ? ' sel' : '';
      const acts = kind === 'dir'
        ? '<span class="dact">' +
          '<button class="mini" data-addfile="' + esc(path) + '" title="ឯកសារថ្មីក្នុងថតនេះ">📄+</button>' +
          '<button class="mini" data-addfolder="' + esc(path) + '" title="ថតរងថ្មី">📁+</button>' +
          '</span>'
        : '';
      return '<div class="tree-row' + on + picked + '" data-kind="' + kind + '" data-path="' + esc(path) + '">' +
        '<span class="tw">' + (kind === 'dir' ? (closed ? '▸' : '▾') : '') + '</span>' +
        '<span class="ic">' + icon + '</span>' +
        '<span class="nm">' + esc(label) + '</span>' +
        acts +
        '<button class="more" data-more="' + esc(path) + '" data-dir="' + (kind === 'dir' ? '1' : '') + '" title="More">⋯</button>' +
        '</div>';
    }
    walk(root, '');
    $('#tree').innerHTML = html.length ? html.join('') : '<div class="tree-empty">គ្មានឯកសារ — ចុច 📄+ ដើម្បីបង្កើត</div>';
    renderDirTarget();
    updateStats();
  }

  // The explorer shows the folder that new files will land in, so "add file"
  // never has to ask again where it should go.
  function renderDirTarget() {
    const bar = $('#dirTarget');
    if (!bar) return;
    const dir = state.selectedDir;
    bar.hidden = !dir;
    if (dir) $('#dirTargetName').textContent = dir + '/';
  }

  function updateStats() {
    const count = state.list.length;
    const bytes = state.list.reduce((n, f) => n + (f.size || 0), 0);
    $('#fileStats').textContent = count + ' files · ' + (bytes / 1024).toFixed(1) + ' KB';
  }

  function expandTo(path) {
    const parts = path.split('/');
    let acc = '';
    parts.slice(0, -1).forEach((p) => { acc += p; delete state.collapsed[acc]; acc += '/'; });
  }

  /* ─────────────────────────────── editor ──────────────────────────────── */

  /* A colour-coded badge per file type, like the tab strip in a native IDE. */
  const FILE_BADGES = [
    [/^build\.gradle(\.kts)?$|\.gradle(\.kts)?$/i, ['G', 'gradle']],
    [/\.jsx$/i, ['JSX', 'jsx']],
    [/\.tsx$/i, ['TSX', 'tsx']],
    [/\.(mjs|cjs|js)$/i, ['JS', 'js']],
    [/\.ts$/i, ['TS', 'ts']],
    [/\.(html?|xhtml)$/i, ['<>', 'html']],
    [/\.css$/i, ['CSS', 'css']],
    [/\.json$/i, ['{}', 'json']],
    [/\.java$/i, ['J', 'java']],
    [/\.(kt|kts)$/i, ['KT', 'kt']],
    [/\.xml$/i, ['<>', 'xml']],
    [/\.(md|markdown)$/i, ['MD', 'md']],
    [/\.py$/i, ['PY', 'py']],
    [/\.(sh|bash)$/i, ['>_', 'sh']],
    [/\.ya?ml$/i, ['YML', 'yml']],
    [/\.sql$/i, ['SQL', 'sql']],
    [/\.(cpp|cc|cxx|hpp)$/i, ['C++', 'cpp']],
    [/\.(c|h)$/i, ['C', 'c']],
    [/\.rs$/i, ['RS', 'rs']],
    [/\.go$/i, ['GO', 'go']],
    [/\.swift$/i, ['SW', 'swift']],
    [/\.php$/i, ['PHP', 'php']],
    [/\.dart$/i, ['DT', 'dart']],
    [/\.(png|jpe?g|webp|gif|svg|ico)$/i, ['IMG', 'img']]
  ];

  function fileBadge(path) {
    const name = baseName(path);
    for (let i = 0; i < FILE_BADGES.length; i++) {
      if (FILE_BADGES[i][0].test(name)) return FILE_BADGES[i][1];
    }
    return ['·', 'txt'];
  }

  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = state.open.map((p) => {
      const dirty = state.dirty[p] ? ' dirty' : '';
      const b = fileBadge(p);
      return '<div class="tab-item' + (p === state.active ? ' on' : '') + dirty + '" data-tab="' + esc(p) + '" title="' + esc(p) + '">' +
        '<span class="ti ' + b[1] + '">' + esc(b[0]) + '</span>' +
        '<span class="tn">' + esc(baseName(p)) + '</span>' +
        '<button class="tx" data-close="' + esc(p) + '" title="Close">✕</button></div>';
    }).join('');
    tabs.hidden = !state.open.length;
  }

  async function openFile(path, line) {
    const meta = state.list.find((f) => f.path === path);
    if (meta && meta.binary) {
      toast('ឯកសារ binary — ទាញយកដើម្បីមើល', 'err');
      return;
    }
    if (!state.files[path]) {
      try {
        const r = await api(projectApi('/file') + '?path=' + encodeURIComponent(path));
        state.files[path] = { text: r.text };
      } catch (err) {
        toast('បើកឯកសារមិនបាន: ' + err.message, 'err');
        return;
      }
    }
    if (state.open.indexOf(path) < 0) state.open.push(path);
    state.active = path;
    $('#emptyState').hidden = true;
    $('#editor').hidden = false;
    state.editor.setLang(path, langOverride(path));
    state.editor.setValue(state.files[path].text);
    $('#stPath').textContent = path;
    $('#stLang').textContent = window.IdeEditor.langLabel(state.editor.lang);
    checkSyntax();
    renderTabs();
    renderTree();
    if (line) state.editor.gotoLine(line);
    closeSidebar();
  }

  function closeTab(path) {
    state.open = state.open.filter((p) => p !== path);
    if (state.active === path) {
      state.active = state.open[state.open.length - 1] || '';
      if (state.active) {
        state.editor.setLang(state.active, langOverride(state.active));
        state.editor.setValue((state.files[state.active] || {}).text || '');
        $('#stPath').textContent = state.active;
        checkSyntax();
      } else {
        $('#editor').hidden = true;
        $('#emptyState').hidden = false;
        $('#stPath').textContent = '—';
        $('#stLang').textContent = 'Text';
      }
    }
    renderTabs();
    renderTree();
  }

  function bindEditor() {
    state.editor = window.IdeEditor.create({
      gutter: $('#gutter'), foldGutter: $('#foldGutter'), pre: $('#highlight'), hl: $('#hlCode'),
      code: $('#code'), wrapEl: $('#codeWrap'),
      onStatus: renderStatus,
      onChange: (text) => {
        if (!state.active) return;
        state.files[state.active] = { text: text };
        state.dirty[state.active] = true;
        setDirtyDot();
        renderTabs();
        saveLocalSoon();
        checkSyntax();
        if (state.settings.auto) saveSoon();
        if (state.settings.live) reloadPreviewSoon();
      },
      onCursor: (line, col, info) => {
        $('#stPos').textContent = 'Ln ' + line + ', Col ' + col;
        const sel = info && info.selected ? info.selected : 0;
        $('#stSel').hidden = !sel;
        if (sel) $('#stSel').textContent = sel + ' sel';
      }
    });
    state.editor.setOptions(state.settings);
  }

  /* ─────────────────────────────── preview ─────────────────────────────── */

  function previewUrl() {
    if (!state.proj) return 'about:blank';
    return '/p/' + state.proj.id + '/' + state.proj.key + '/index.html?t=' + Date.now();
  }

  function reloadPreview() {
    if (!state.proj) return;
    const frame = $('#preview');
    state.previewErrors = [];
    renderProblems();
    frame.src = previewUrl();
    $('#pvOpen').href = previewUrl();
    $('#stStatus').textContent = '● Preview: index.html';
  }

  const reloadPreviewSoon = debounce(reloadPreview, 900);

  function bindPreviewMessages() {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || !d.__ide) return;
      if (d.type === 'error') {
        state.previewErrors.push({ file: d.file || 'index.html', line: d.line || 0, message: d.message || 'Error' });
        renderProblems();
        logLine('output', '⚠ ' + (d.message || 'Error') + (d.line ? ' (line ' + d.line + ')' : ''), 'err');
        $('#bottom').classList.remove('collapsed');
      } else if (d.type === 'console') {
        logLine('output', '[' + d.level + '] ' + (d.args || []).join(' '), d.level === 'error' ? 'err' : '');
      } else if (d.type === 'ready') {
        setStatus('Preview ready', 'ok');
      }
    });
  }

  function logLine(id, text, cls) {
    const el = $('#' + id);
    const line = document.createElement('span');
    line.className = cls || '';
    line.textContent = text + '\n';
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    while (el.childNodes.length > 400) el.removeChild(el.firstChild);
  }

  /* Diagnostics come from the editor's own checks: a real parse for JSON and
     JavaScript, a structural scan elsewhere. The panel names the engine so a
     highlight is never mistaken for a compiler. */
  const checkSyntax = debounce(() => {
    state.syntaxErrors = [];
    state.diagEngine = '';
    const path = state.active;
    if (path) {
      const text = (state.files[path] || {}).text;
      if (typeof text === 'string' && text.length < 400000) {
        const res = window.IdeEditor.diagnose(text, state.editor ? state.editor.lang : window.IdeEditor.langOf(path));
        state.diagEngine = res.engine;
        res.items.forEach((i) => state.syntaxErrors.push({ file: path, line: i.line, message: i.message }));
      }
    }
    renderProblems();
  }, 650);

  function renderProblems() {
    const items = state.previewErrors.concat(state.syntaxErrors);
    const hasIndex = state.list.some((f) => f.path === 'index.html');
    // Only a web project needs index.html; a native one never does, and saying
    // so would send the user chasing a file their APK does not use.
    const nativeProj = state.list.some((f) => /^(app\/src\/main|build\.gradle|settings\.gradle)/.test(f.path));
    if (state.list.length && !hasIndex && !nativeProj) {
      items.unshift({ message: 'ខ្វះ index.html នៅ root — preview និង APK ត្រូវការវា', file: 'index.html', line: 0 });
    }
    $('#problemCount').textContent = String(items.length);
    $('#problemCount').className = 'pill' + (items.length ? ' bad' : ' ok');
    const engine = state.diagEngine
      ? '<div class="engine">ការត្រួតពិនិត្យ៖ ' + esc(state.diagEngine) + '</div>' : '';
    $('#problems').innerHTML = engine + (items.length
      ? items.map((i) => '<div class="prob" data-file="' + esc(i.file) + '" data-line="' + (i.line || 0) + '">' +
          '<span class="err">✖ ' + esc(i.file) + (i.line ? ':' + i.line : '') + ' — ' + esc(i.message) + '</span></div>').join('')
      : '<span class="ok">✔ គ្មានបញ្ហា</span>');
    // While a build runs the status bar should keep showing the live percent
    // instead of resetting to "—" every time problems are re-rendered.
    const live = state.build.busy && typeof state.build.pct === 'number'
      ? state.build.pct + '%' : '';
    $('#stBuild').textContent = items.length
      ? ('Problems: ' + items.length)
      : 'APK: ' + (state.build.busy ? (live || 'building') : (state.build.last || '—'));
  }

  /* ─────────────────────────────── files ops ───────────────────────────── */

  function hasDir(path) {
    if (!path) return true;
    if (state.dirs.indexOf(path) >= 0) return true;
    return state.list.some((f) => f.path.indexOf(path + '/') === 0);
  }

  async function refreshList() {
    const info = await api(projectApi());
    state.list = info.files || [];
    state.dirs = Array.isArray(info.dirs) ? info.dirs.slice() : [];
    if (state.selectedDir && !hasDir(state.selectedDir)) state.selectedDir = '';
    await loadMissingText();
    renderTree();
    saveLocal();
  }

  async function createFile(path, text) {
    const p = String(path || '').replace(/^\.?\//, '').replace(/^\/+/, '');
    if (!p) throw new Error('ឈ្មោះឯកសារទទេ');
    await api(projectApi('/file'), { method: 'PUT', body: { path: p, text: text || '' } });
    state.files[p] = { text: text || '' };
    expandTo(p);
    await refreshList();
    await openFile(p);
    toast('បង្កើត ' + p, 'ok');
    return p;
  }

  async function createFolder(path) {
    const p = String(path || '').replace(/^\.?\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!p) throw new Error('ឈ្មោះថតទទេ');
    const res = await api(projectApi('/mkdir'), { method: 'POST', body: { path: p } });
    const saved = (res && res.path) || p;
    delete state.collapsed[saved];
    await refreshList();
    if (!hasDir(saved)) state.dirs.push(saved);
    state.selectedDir = saved;
    renderTree();
    toast('បង្កើតថត ' + saved, 'ok');
    return saved;
  }

  function movedPath(path, from, to) {
    return path === from || path.indexOf(from + '/') === 0 ? to + path.slice(from.length) : path;
  }

  async function renameEntry(from, to) {
    await api(projectApi('/move'), { method: 'POST', body: { from: from, to: to } });
    Object.keys(state.files).forEach((p) => {
      const next = movedPath(p, from, to);
      if (next === p) return;
      state.files[next] = state.files[p];
      delete state.files[p];
    });
    state.open = state.open.map((p) => movedPath(p, from, to));
    state.dirs = state.dirs.map((d) => movedPath(d, from, to));
    if (state.selectedDir) state.selectedDir = movedPath(state.selectedDir, from, to);
    if (movedPath(state.active, from, to) !== state.active) state.active = movedPath(state.active, from, to);
    await refreshList();
    if (state.active) await openFile(state.active);
    toast('ប្តូរឈ្មោះរួច', 'ok');
  }

  async function deleteEntry(path) {
    if (!window.confirm('លុប "' + path + '" ?')) return;
    await api(projectApi('/delete'), { method: 'POST', body: { path: path } });
    state.dirs = state.dirs.filter((d) => d !== path && d.indexOf(path + '/') !== 0);
    if (state.selectedDir === path || state.selectedDir.indexOf(path + '/') === 0) state.selectedDir = '';
    Object.keys(state.files).forEach((p) => {
      if (p === path || p.indexOf(path + '/') === 0) delete state.files[p];
    });
    state.open = state.open.filter((p) => p !== path && p.indexOf(path + '/') !== 0);
    if (state.active === path) closeTab(path);
    await refreshList();
    toast('លុបរួច', 'ok');
  }

  function downloadActive() {
    const path = state.active;
    if (!path) return toast('បើកឯកសារសិន', 'err');
    const meta = state.list.find((f) => f.path === path);
    if (meta && meta.binary) {
      window.open(projectApi('/asset') + '?path=' + encodeURIComponent(path) + '&key=' + encodeURIComponent(state.proj.key));
      return;
    }
    const text = (state.files[path] || {}).text || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = baseName(path);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function exportZip() {
    if (!state.proj) return;
    const url = projectApi('/zip') + '?key=' + encodeURIComponent(state.proj.key);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.proj.name || 'project') + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importZip(file) {
    const data = await readAsDataUrl(file);
    const r = await api(projectApi('/import'), { method: 'POST', body: { data: data } });
    await refreshList();
    toast('នាំចូល ' + r.added + ' ឯកសារ', 'ok');
    if (state.list.some((f) => f.path === 'index.html')) await openFile('index.html');
    reloadPreview();
  }

  async function uploadFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.name.replace(/[^\w.\-]+/g, '-');
      try {
        if (isText(path)) {
          const text = await file.text();
          await api(projectApi('/file'), { method: 'PUT', body: { path: path, text: text } });
          state.files[path] = { text: text };
        } else {
          const b64 = await readAsBase64(file);
          await api(projectApi('/asset'), { method: 'PUT', body: { path: path, data: b64 } });
        }
      } catch (err) {
        toast('ផ្ទុក ' + path + ' មិនបាន: ' + err.message, 'err');
      }
    }
    await refreshList();
    toast('ផ្ទុកឯកសាររួច', 'ok');
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('read failed'));
      fr.readAsDataURL(file);
    });
  }

  function readAsBase64(file) {
    return readAsDataUrl(file).then((url) => String(url).split(',')[1] || '');
  }

  /* ─────────────────────────────── modal ──────────────────────────────── */

  function ask(opts) {
    return new Promise((resolve) => {
      const modal = $('#modal');
      const input = $('#modalInput');
      const select = $('#modalSelect');
      $('#modalTitle').textContent = opts.title || 'Input';
      $('#modalHint').textContent = opts.hint || '';
      input.hidden = !!opts.options;
      select.hidden = !opts.options;
      if (opts.options) {
        select.innerHTML = opts.options.map((o) =>
          '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('');
        if (opts.value) select.value = opts.value;
      } else {
        input.value = opts.value || '';
        input.placeholder = opts.placeholder || '';
      }
      modal.hidden = false;
      setTimeout(() => (opts.options ? select : input).focus(), 30);
      function done(value) {
        modal.hidden = true;
        $('#modalOk').removeEventListener('click', ok);
        $('#modalCancel').removeEventListener('click', cancel);
        modal.removeEventListener('keydown', key);
        resolve(value);
      }
      function ok() { done(opts.options ? select.value : input.value.trim()); }
      function cancel() { done(null); }
      function key(e) {
        if (e.key === 'Enter') { e.preventDefault(); ok(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }
      $('#modalOk').addEventListener('click', ok);
      $('#modalCancel').addEventListener('click', cancel);
      modal.addEventListener('keydown', key);
    });
  }

  /* ─────────────────────────────── search ──────────────────────────────── */

  const runSearch = debounce(() => {
    const q = $('#searchInput').value.trim();
    const out = $('#searchResults');
    if (q.length < 2) {
      out.innerHTML = '';
      $('#searchHint').textContent = 'វាយយ៉ាងតិច ២ តួអក្សរ';
      return;
    }
    const hits = [];
    Object.keys(state.files).forEach((path) => {
      const text = (state.files[path] || {}).text || '';
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (line.toLowerCase().indexOf(q.toLowerCase()) >= 0 && hits.length < 80) {
          hits.push({ path: path, line: i + 1, text: line.trim().slice(0, 120) });
        }
      });
    });
    $('#searchHint').textContent = hits.length + ' លទ្ធផល';
    out.innerHTML = hits.map((h) =>
      '<div class="result-row" data-open="' + esc(h.path) + '" data-line="' + h.line + '">' +
      '<b>' + esc(h.path) + ':' + h.line + '</b><span class="result-snip">' + esc(h.text) + '</span></div>').join('');
  }, 260);

  async function replaceAll() {
    const find = $('#searchInput').value;
    const rep = $('#searchReplace').value;
    if (!find) return;
    let changed = 0;
    for (const path of Object.keys(state.files)) {
      const rec = state.files[path];
      if (!rec || typeof rec.text !== 'string') continue;
      if (rec.text.indexOf(find) < 0) continue;
      rec.text = rec.text.split(find).join(rep);
      changed += 1;
      await saveFile(path);
    }
    if (state.active && state.files[state.active]) {
      state.editor.setValue(state.files[state.active].text);
    }
    toast('ជំនួសក្នុង ' + changed + ' ឯកសារ', changed ? 'ok' : 'err');
    runSearch();
    reloadPreview();
  }

  /* ─────────────────────────────── templates ───────────────────────────── */

  const TEMPLATES = {
    // Native starters come from the Android generator, so the files in the
    // project are exactly what Gradle will compile.
    nativeKotlin: { label: 'Native Android (Kotlin)', gen: 'native' },
    javaNative: { label: 'Native Android (Java)', gen: 'java' },
    ndkCpp: { label: 'C/C++ Android NDK', gen: 'ndk' },
    systemApp: { label: 'System App (Android)', gen: 'system' },
    blank: {
      label: 'Blank Web App',
      files: {
        'index.html': [
          '<!DOCTYPE html>', '<html lang="km">', '<head>', '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>App ថ្មី</title>', '  <link rel="stylesheet" href="css/style.css" />',
          '</head>', '<body>', '  <main class="card">', '    <h1>សួស្តី 👋</h1>',
          '    <p>កែឯកសារនេះ ហើយមើលជាមុនភ្លាមៗ។</p>',
          '    <button id="go">ចុចខ្ញុំ</button>', '  </main>',
          '  <script src="js/app.js"></script>', '</body>', '</html>', ''
        ].join('\n'),
        'css/style.css': [
          ':root { color-scheme: dark; }',
          'body { margin: 0; min-height: 100vh; display: grid; place-items: center;',
          '  font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; }',
          '.card { background: #161b22; border: 1px solid #30363d; border-radius: 14px;',
          '  padding: 28px 32px; text-align: center; max-width: 90vw; }',
          'h1 { margin: 0 0 8px; font-size: 24px; }',
          'button { margin-top: 14px; background: #388bfd; color: #fff; border: 0;',
          '  border-radius: 8px; padding: 10px 18px; font-size: 15px; }', ''
        ].join('\n'),
        'js/app.js': [
          'const button = document.getElementById("go");',
          'button.addEventListener("click", () => {',
          '  button.textContent = "ចុចម្តងទៀត 🎉";',
          '  console.log("clicked");',
          '});', ''
        ].join('\n'),
        'README.md': '# App ថ្មី\n\nបង្កើតដោយ AppForge IDE។ កែ `index.html`, `css/style.css` និង `js/app.js`។\n'
      }
    },
    landing: {
      label: 'Landing Page',
      files: {
        'index.html': [
          '<!DOCTYPE html>', '<html lang="km">', '<head>', '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>ហាងខ្ញុំ</title>', '  <link rel="stylesheet" href="css/style.css" />',
          '</head>', '<body>',
          '  <header class="nav"><b>ហាងខ្ញុំ</b><nav><a href="#features">លក្ខណៈ</a><a href="#contact">ទំនាក់ទំនង</a></nav></header>',
          '  <section class="hero"><h1>លក់ទំនិញ ងាយស្រួល</h1>',
          '    <p>បញ្ជាទិញតាមទូរស័ព្ទ ដឹកជញ្ជូនរហ័ស</p>',
          '    <a class="cta" href="#contact">បញ្ជាទិញឥឡូវ</a></section>',
          '  <section id="features" class="grid"><div class="card"><h3>តម្លៃល្អ</h3><p>ធានាគុណភាព</p></div>',
          '    <div class="card"><h3>ដឹកជញ្ជូន</h3><p>១-២ ថ្ងៃ</p></div>',
          '    <div class="card"><h3>ទូទាត់</h3><p>ABA / Wing</p></div></section>',
          '  <footer id="contact">ទំនាក់ទំនង: 012 345 678</footer>',
          '  <script src="js/app.js"></script>', '</body>', '</html>', ''
        ].join('\n'),
        'css/style.css': [
          ':root { color-scheme: light; }',
          '* { box-sizing: border-box; }',
          'body { margin: 0; font-family: system-ui, sans-serif; color: #0f172a; background: #f8fafc; }',
          '.nav { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: #fff; position: sticky; top: 0; }',
          '.nav nav a { margin-left: 14px; color: #2563eb; text-decoration: none; }',
          '.hero { padding: 64px 20px; text-align: center; background: linear-gradient(160deg, #2563eb, #7c3aed); color: #fff; }',
          '.hero h1 { font-size: 34px; margin: 0 0 10px; }',
          '.cta { display: inline-block; margin-top: 18px; background: #fff; color: #1d4ed8; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 600; }',
          '.grid { display: grid; gap: 16px; padding: 28px 20px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }',
          '.card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 6px 20px rgba(15, 23, 42, .08); }',
          'footer { text-align: center; padding: 24px; color: #64748b; }', ''
        ].join('\n'),
        'js/app.js': [
          'document.querySelectorAll("a[href^=\\"#\\"]").forEach((a) => {',
          '  a.addEventListener("click", (e) => {',
          '    const target = document.querySelector(a.getAttribute("href"));',
          '    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }',
          '  });',
          '});', ''
        ].join('\n')
      }
    },
    notes: {
      label: 'Notes App',
      files: {
        'index.html': [
          '<!DOCTYPE html>', '<html lang="km">', '<head>', '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>កត់ត្រា</title>', '  <link rel="stylesheet" href="css/style.css" />', '</head>', '<body>',
          '  <h1>📝 កត់ត្រា</h1>',
          '  <div class="row"><input id="text" placeholder="សរសេរអ្វីមួយ…" />',
          '    <button id="add">បន្ថែម</button></div>',
          '  <ul id="list"></ul>', '  <script src="js/app.js"></script>', '</body>', '</html>', ''
        ].join('\n'),
        'css/style.css': [
          'body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #0d1117; color: #c9d1d9; }',
          'h1 { font-size: 22px; }',
          '.row { display: flex; gap: 8px; }',
          'input { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #30363d; background: #161b22; color: inherit; }',
          'button { padding: 10px 14px; border: 0; border-radius: 8px; background: #3fb950; color: #fff; }',
          'ul { list-style: none; padding: 0; margin-top: 16px; }',
          'li { display: flex; justify-content: space-between; gap: 8px; padding: 10px; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 8px; }',
          'li button { background: #f85149; padding: 4px 8px; }', ''
        ].join('\n'),
        'js/app.js': [
          'const list = document.getElementById("list");',
          'const input = document.getElementById("text");',
          'const load = () => JSON.parse(localStorage.getItem("notes") || "[]");',
          'const save = (notes) => localStorage.setItem("notes", JSON.stringify(notes));',
          'function render() {',
          '  list.innerHTML = "";',
          '  load().forEach((note, i) => {',
          '    const li = document.createElement("li");',
          '    li.textContent = note;',
          '    const del = document.createElement("button");',
          '    del.textContent = "✕";',
          '    del.onclick = () => { const n = load(); n.splice(i, 1); save(n); render(); };',
          '    li.appendChild(del);',
          '    list.appendChild(li);',
          '  });',
          '}',
          'document.getElementById("add").onclick = () => {',
          '  const text = input.value.trim();',
          '  if (!text) return;',
          '  const notes = load(); notes.push(text); save(notes); input.value = ""; render();',
          '};',
          'render();', ''
        ].join('\n')
      }
    },
    android: {
      label: 'Android (Kotlin) + WebView',
      files: {
        'index.html': [
          '<!DOCTYPE html>', '<html lang="km">', '<head>', '  <meta charset="utf-8" />',
          '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
          '  <title>App Android</title>', '  <link rel="stylesheet" href="css/style.css" />', '</head>', '<body>',
          '  <h1>សួស្តី Android 🙌</h1>',
          '  <p>ឯកសារនេះត្រូវបញ្ចូលក្នុង APK ជា WebView asset។</p>',
          '  <script src="js/app.js"></script>', '</body>', '</html>', ''
        ].join('\n'),
        'css/style.css': 'body { font-family: system-ui, sans-serif; margin: 0; padding: 28px; background: #0b0f14; color: #eaf2ff; }\nh1 { font-size: 24px; }\n',
        'js/app.js': 'console.log("Android WebView ready");\n',
        'app/src/main/java/com/example/app/MainActivity.kt': [
          'package com.example.app',
          '',
          'import android.os.Bundle',
          'import android.webkit.WebView',
          'import androidx.appcompat.app.AppCompatActivity',
          '',
          'class MainActivity : AppCompatActivity() {',
          '    override fun onCreate(savedInstanceState: Bundle?) {',
          '        super.onCreate(savedInstanceState)',
          '        val web = WebView(this)',
          '        web.settings.javaScriptEnabled = true',
          '        web.loadUrl("file:///android_asset/www/index.html")',
          '        setContentView(web)',
          '    }',
          '}', ''
        ].join('\n')
      }
    }
  };

  /* A new project holds no files: the user creates them, so nothing appears
     in the tree before they asked for it. */
  async function createEmptyProject() {
    const name = await ask({
      title: 'គម្រោងថ្មី', hint: 'គ្មានឯកសារ — អ្នកបង្កើតដោយខ្លួនឯង',
      value: 'គម្រោងថ្មី', placeholder: 'ឧ. ហាងខ្ញុំ'
    });
    if (name === null) return;
    try {
      const created = await api('/api/ide/project', { method: 'POST', key: false, body: { name: name } });
      state.proj = { id: created.id, key: created.key, name: created.name };
      state.files = {};
      state.list = [];
      state.open = [];
      state.active = '';
      state.dirty = {};
      try { localStorage.setItem(LS.proj, JSON.stringify(state.proj)); } catch (e) {}
      await loadProject();
      $('#projName').value = state.proj.name;
      $('#projLabel').textContent = state.proj.name;
      $('#emptyState').hidden = false;
      $('#editor').hidden = true;
      renderTree();
      renderTabs();
      updateStats();
      toast('គម្រោងទទេ — ចុច ＋ ដើម្បីបង្កើតឯកសារ', 'ok');
    } catch (err) {
      toast('បង្កើតគម្រោងមិនបាន: ' + err.message, 'err');
    }
  }

  function dirBase(baseDir) {
    const dir = baseDir === undefined || baseDir === null ? state.selectedDir : String(baseDir);
    if (dir) return dir.replace(/\/+$/, '') + '/';
    return state.active ? dirOf(state.active) : '';
  }

  async function newFilePrompt(baseDir) {
    if (baseDir && baseDir.preventDefault) baseDir = undefined; // ignore click events
    const path = await ask({ title: 'ឯកសារថ្មី', hint: 'ឈ្មោះ/ផ្លូវ (ឧ. js/app.js)', value: dirBase(baseDir), placeholder: 'index.html' });
    if (!path) return;
    try { await createFile(path); } catch (e) { toast(e.message, 'err'); }
  }

  async function newFolderPrompt(baseDir) {
    if (baseDir && baseDir.preventDefault) baseDir = undefined;
    const path = await ask({ title: 'ថតថ្មី', hint: 'ឈ្មោះថត (ឧ. assets/img)', value: dirBase(baseDir), placeholder: 'css' });
    if (!path) return;
    try { await createFolder(path); } catch (e) { toast(e.message, 'err'); }
  }

  async function createWithTemplate(templateId) {
    const tpl = TEMPLATES[templateId] || TEMPLATES.blank;
    const name = await ask({
      title: 'គម្រោងថ្មី', hint: 'ឈ្មោះគម្រោង (អាចកែពេលក្រោយ)',
      value: 'គម្រោងថ្មី', placeholder: 'ឧ. ហាងខ្ញុំ'
    });
    if (name === null) return;
    try {
      const created = await api('/api/ide/project', { method: 'POST', key: false, body: { name: name } });
      state.proj = { id: created.id, key: created.key, name: created.name };
      state.files = {};
      state.list = [];
      state.open = [];
      state.active = '';
      state.dirty = {};
      const source = tpl.gen
        ? G.build({ name: name, template: tpl.gen }).files
        : Object.keys(tpl.files).map((p) => ({ path: p, text: tpl.files[p] }));
      for (let i = 0; i < source.length; i++) {
        await api(projectApi('/file'), { method: 'PUT', body: { path: source[i].path, text: source[i].text } });
        state.files[source[i].path] = { text: source[i].text };
      }
      $('#projName').value = state.proj.name;
      await loadProject();
      const first = source.some((f) => f.path === 'index.html') ? 'index.html'
        : (source.map((f) => f.path).find((p) => /MainActivity\.(kt|java)$/.test(p)) || source[0].path);
      await openFile(first);
      reloadPreview();
      const v = Object.assign({}, state.settings);
      try { localStorage.setItem(LS.proj, JSON.stringify(state.proj)); } catch (e) {}
      toast('បង្កើតគម្រោងរួច — ' + templateId, 'ok');
      setStatus('Project ready', 'ok');
    } catch (err) {
      toast('បង្កើតគម្រោងមិនបាន: ' + err.message, 'err');
    }
  }

  /* ──────────────────────────────── build ──────────────────────────────── */

  function buildConfig() {
    const perms = $$('#perms input:checked').map((i) => i.value);
    return {
      name: $('#bName').value || 'AppForge App',
      pkg: $('#bPkg').value,
      versionName: $('#bVersion').value || '1.0',
      versionCode: $('#bCode').value || '1',
      online: $('#bMode').value === 'online',
      url: $('#bUrl').value,
      orientation: $('#bOrientation').value,
      permissions: perms,
      target: ($('#bTarget') || {}).value || 'debug',
      icon: state.icon,
      color: '#12B886'
    };
  }

  async function collectProjectFiles() {
    const out = [];
    for (const f of state.list) {
      if (f.binary) {
        try {
          const res = await fetch(projectApi('/asset') + '?path=' + encodeURIComponent(f.path), {
            headers: { 'X-Project-Key': state.proj.key }
          });
          const blob = await res.blob();
          const b64 = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          });
          out.push({ path: f.path, b64: b64 });
        } catch (e) { /* skip unreadable asset */ }
      } else if (state.files[f.path] && typeof state.files[f.path].text === 'string') {
        out.push({ path: f.path, text: state.files[f.path].text });
      }
    }
    return out;
  }

  async function startBuild() {
    if (state.build.busy) return;
    const cfg = buildConfig();
    const files = await collectProjectFiles();
    // A native project needs no index.html; a web one needs it to have anything
    // to show, so only the web case is refused here.
    const native = files.some((f) => /^(app\/src\/main|build\.gradle|settings\.gradle)/.test(f.path));
    if (!native && !files.some((f) => f.path === 'index.html')) {
      toast('ត្រូវមាន index.html នៅ root ឬឯកសារ Android មុនពេល build', 'err');
      return;
    }
    const result = G.buildProject(cfg, files);
    const check = G.verify(result);
    logLine('buildlog', '▸ ' + result.files.length + ' files (' + result.web + ' web, ' + result.native + ' native)');
    if (!check.ok) logLine('buildlog', check.issues.join('\n'), 'err');
    // These end in a red Gradle run every time, so stop before creating a repo.
    if (check.blockers && check.blockers.length) {
      logLine('buildlog', check.blockers.join('\n'), 'err');
      toast('បញ្ឈប់ build — build script ខ្វះ dependency ដែលកូដត្រូវការ', 'err');
      setStatus('Build បញ្ឈប់');
      return;
    }

    state.build.busy = true;
    state.build.pct = null;
    $('#btnStartBuild').disabled = true;
    $('#buildState').textContent = '⏳ កំពុងបង្កើត repo និងបញ្ជូនឯកសារ…';
    $('#buildState').className = 'build-state';
    setBuildProgress(null);
    try {
      const payload = {
        repo: (G.normalize({ name: cfg.name }).pkg.split('.').pop() || 'app') + '-apk-' + Date.now().toString(36),
        files: result.files,
        private: false
      };
      const r = await fetch('/api/appforge/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      // A proxy can cut a long request and leave an empty body; never let that
      // surface as "Unexpected end of JSON input".
      const raw = await r.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
      if (!r.ok) {
        throw new Error(data.detail || ('Server ' + r.status +
          (raw ? ': ' + raw.slice(0, 140) : ' — មិនបានឆ្លើយតប (សាកម្តងទៀត)')));
      }
      if (!data.repo) throw new Error('Server មិនបានបង្កើត repo — សាកម្តងទៀត');
      state.build.repo = data.repo;
      state.build.url = data.url;
      $('#repoLink').href = data.url;
      $('#repoLink').hidden = false;
      logLine('buildlog', '✔ repo: ' + data.repo + ' (' + data.files + ' files)', 'ok');
      $('#buildState').textContent = '⏳ GitHub Actions កំពុង build (~២–៤ នាទី)…';
      setStatus('Building APK…');
      pollBuild(true);
    } catch (err) {
      state.build.busy = false;
      $('#btnStartBuild').disabled = false;
      $('#buildState').textContent = '✖ ' + err.message;
      $('#buildState').className = 'build-state err';
      logLine('buildlog', '✖ ' + err.message, 'err');
      toast(err.message, 'err');
    }
  }

  function setBuildProgress(pct, cls) {
    // Only ever called with a number the server read from GitHub, or null.
    const bar = $('#buildBar');
    const fill = $('#buildBarFill');
    if (!bar || !fill) return;
    if (typeof pct !== 'number' || !isFinite(pct)) {
      bar.hidden = true;
      bar.className = 'build-bar';
      fill.style.width = '0%';
      return;
    }
    bar.hidden = false;
    bar.className = 'build-bar' + (cls ? ' ' + cls : '');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  async function pollBuild(start) {
    clearTimeout(state.build.timer);
    if (!state.build.repo) return;
    try {
      const r = await fetch('/api/appforge/status?repo=' + encodeURIComponent(state.build.repo));
      const s = await r.json().catch(() => ({ state: 'unknown' }));
      if (s.state === 'running' || s.state === 'starting') {
        const pct = typeof s.progress === 'number' ? Math.round(s.progress) : null;
        const parts = [pct === null
          ? '⏳ ' + (s.state === 'starting' ? 'ចាប់ផ្តើម…' : 'កំពុង build…')
          : '⏳ ' + pct + '%'];
        if (s.step) parts.push(s.step);
        if (s.steps_total) parts.push('(' + s.steps_done + '/' + s.steps_total + ' step)');
        $('#buildState').textContent = parts.join(' · ');
        state.build.pct = pct;
        $('#stBuild').textContent = 'APK: ' + (pct === null ? 'building' : pct + '%');
        setBuildProgress(pct);
        state.build.timer = setTimeout(pollBuild, start ? 6000 : 9000);
        return;
      }
      if (s.state === 'done') {
        $('#buildState').textContent = '✅ APK រួចរាល់ — ចុច "ទាញយក APK"';
        $('#buildState').className = 'build-state ok';
        setBuildProgress(100, 'ok');
        // Only show the buttons for files this run really produced.
        const q = 'repo=' + encodeURIComponent(state.build.repo) + '&kind=';
        const apk = $('#apkLink');
        apk.hidden = !(s.apk_ready || !s.aab_ready);
        apk.href = '/api/appforge/apk?' + q + 'apk';
        const aab = $('#aabLink');
        if (aab) { aab.hidden = !s.aab_ready; aab.href = '/api/appforge/apk?' + q + 'aab'; }
        const ks = $('#keystoreLink');
        if (ks) { ks.hidden = !s.keystore_ready; ks.href = '/api/appforge/apk?' + q + 'keystore'; }
        state.build.busy = false;
        state.build.pct = null;
        state.build.last = 'ready';
        $('#btnStartBuild').disabled = false;
        setStatus('APK ready', 'ok');
        addHistory({ repo: state.build.repo, url: state.build.url, state: 'done', at: Date.now() });
        refreshLogs();
      } else if (s.state === 'failed') {
        $('#buildState').textContent = '✖ Build បរាជ័យ — មើល Build log' +
          (typeof s.progress === 'number' ? ' (នៅ ' + Math.round(s.progress) + '%)' : '');
        $('#buildState').className = 'build-state err';
        setBuildProgress(typeof s.progress === 'number' ? Math.round(s.progress) : null, 'err');
        state.build.busy = false;
        state.build.pct = null;
        state.build.last = 'failed';
        $('#btnStartBuild').disabled = false;
        setStatus('Build failed', 'err');
        addHistory({ repo: state.build.repo, url: state.build.url, state: 'failed', at: Date.now() });
        refreshLogs();
      } else {
        $('#buildState').textContent = '… ' + (s.detail || 'កំពុងរង់ចាំ GitHub');
        state.build.timer = setTimeout(pollBuild, 12000);
      }
      renderProblems();
    } catch (err) {
      state.build.timer = setTimeout(pollBuild, 12000);
    }
  }

  async function refreshLogs() {
    if (!state.build.repo) return toast('មិនទាន់មាន build', 'err');
    try {
      const r = await fetch('/api/appforge/logs?repo=' + encodeURIComponent(state.build.repo));
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status));
      $('#buildlog').textContent = d.logs || '(គ្មាន log)';
      showBottom('buildlog');
      if (d.run_url) {
        $('#repoLink').href = d.run_url;
      }
    } catch (err) {
      toast('អាន log មិនបាន: ' + err.message, 'err');
    }
  }

  function addHistory(entry) {
    state.history.unshift(entry);
    state.history = state.history.slice(0, 12);
    try { localStorage.setItem(LS.history, JSON.stringify(state.history)); } catch (e) {}
    renderHistory();
  }

  function adminHeaders() {
    return { 'Content-Type': 'application/json', 'X-Admin-Key': ($('#adminKey').value || '').trim() };
  }

  async function readJson(r) {
    // A proxy can cut a long response; never surface "Unexpected end of JSON".
    const raw = await r.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
    if (!r.ok) {
      throw new Error(data.detail || ('Server ' + r.status +
        (raw ? ': ' + raw.slice(0, 140) : ' — មិនបានឆ្លើយតប')));
    }
    return data;
  }

  async function listBuildRepos() {
    const list = $('#cleanupList');
    list.innerHTML = '';
    $('#btnDeleteRepos').hidden = true;
    if (!(($('#adminKey').value || '').trim())) return toast('ដាក់ ADMIN_KEY សិន', 'err');
    try {
      const data = await readJson(await fetch('/api/appforge/repositories', { headers: adminHeaders() }));
      const repos = data.repositories || [];
      if (!repos.length) {
        list.innerHTML = '<li class="hint">គ្មាន repo សាកល្បងទេ</li>';
        return;
      }
      repos.forEach((repo) => {
        const li = document.createElement('li');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pick';
        cb.value = repo.repo;
        const a = document.createElement('a');
        a.href = repo.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = repo.repo;
        const when = document.createElement('span');
        when.textContent = repo.created ? new Date(repo.created).toLocaleDateString() : '';
        li.append(cb, a, when);
        list.appendChild(li);
      });
      $('#btnDeleteRepos').hidden = false;
    } catch (err) {
      toast(err.message, 'err');
      list.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = err.message;
      list.appendChild(li);
    }
  }

  async function deleteSelectedRepos() {
    const picked = $$('#cleanupList input.pick:checked').map((cb) => cb.value);
    if (!picked.length) return toast('ជ្រើស repo សិន', 'err');
    const ok = confirm('លុប ' + picked.length + ' repo?\n\n' + picked.join('\n') +
      '\n\nសកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។');
    if (!ok) return;
    const failed = [];
    for (const repo of picked) {
      try {
        await readJson(await fetch('/api/appforge/repository/delete', {
          method: 'POST', headers: adminHeaders(), body: JSON.stringify({ repo: repo })
        }));
      } catch (err) {
        failed.push(repo + ' — ' + err.message);
      }
    }
    const gone = picked.length - failed.length;
    toast('លុបរួច ' + gone + '/' + picked.length, failed.length ? 'err' : 'ok');
    if (failed.length) logLine('buildlog', failed.join('\n'), 'err');
    listBuildRepos();
    renderHistory();
  }

  function renderHistory() {
    $('#buildHistory').innerHTML = state.history.map((h) =>
      '<li><b>' + esc(h.repo) + '</b><span>' + new Date(h.at).toLocaleString() +
      ' · ' + esc(h.state) + '</span></li>').join('');
  }

  function bindIcon() {
    $('#iconInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readAsDataUrl(file);
        const img = new Image();
        img.onload = () => {
          const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
          const icon = {};
          Object.keys(sizes).forEach((density) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = sizes[density];
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, sizes[density], sizes[density]);
            icon[density] = canvas.toDataURL('image/png').split(',')[1];
          });
          state.icon = icon;
          const prev = $('#iconPreview');
          prev.src = dataUrl;
          prev.hidden = false;
          toast('រូប icon ត្រៀមរួច (' + Object.keys(icon).length + ' ទំហំ)', 'ok');
        };
        img.onerror = () => toast('រូបមិនត្រឹមត្រូវ', 'err');
        img.src = dataUrl;
      } catch (err) {
        toast('អានរូបមិនបាន', 'err');
      }
    });
    $('#iconClear').addEventListener('click', () => {
      state.icon = null;
      $('#iconPreview').hidden = true;
      $('#iconInput').value = '';
    });
  }

  async function checkReady() {
    try {
      const r = await fetch('/api/appforge/ready');
      const d = await r.json();
      const pill = $('#tokenPill');
      if (d.github) {
        pill.textContent = 'GitHub ✓';
        pill.className = 'pill ok';
      } else {
        pill.textContent = 'ត្រូវការ token';
        pill.className = 'pill bad';
        $('#buildState').textContent = 'Server គ្មាន GITHUB_TOKEN — build APK មិនអាចចាប់ផ្ដើម (ZIP/Export នៅប្រើបាន)។';
      }
      // The cleanup tool needs ADMIN_KEY on the server; hide it when absent.
      if (d.cleanup === false) $('#btnCleanup').hidden = true;
    } catch (e) { /* offline */ }
  }

  /* ─────────────────────────────── settings ────────────────────────────── */

  function applySettings() {
    const s = state.settings;
    document.documentElement.setAttribute('data-theme', s.theme);
    document.body.setAttribute('data-lang', s.lang);
    if (state.editor) state.editor.setOptions({ fontSize: s.fontSize, tabSize: s.tabSize, wrap: s.wrap });
    $('#setTheme').value = s.theme;
    $('#setFont').value = s.fontSize;
    $('#setTab').value = s.tabSize;
    $('#setWrap').checked = s.wrap;
    $('#setAuto').checked = s.auto;
    $('#setLive').checked = s.live;
    $('#setLang').value = s.lang;
    $('#btnTheme').textContent = s.theme === 'dark' ? '🌙' : '☀️';
    $('#btnLang').textContent = s.lang === 'km' ? 'KM' : 'EN';
    applyLang();
  }

  function saveSettings() {
    try { localStorage.setItem(LS.settings, JSON.stringify(state.settings)); } catch (e) {}
  }

  function applyLang() {
    const km = state.settings.lang !== 'en';
    const dict = km ? {
      newProject: '＋ ថ្មី', import: '⬆ Import', export: '⬇ ZIP', run: '▶ Run', buildApk: '🤖 Build APK',
      explorer: 'ឯកសារ', search: 'ស្វែងរក', buildTitle: 'Build APK', appName: 'ឈ្មោះ App',
      versionName: 'Version', versionCode: 'Build', mode: 'របៀបដំណើរការ', orientation: 'ទិសអេក្រង់',
      offline: 'Offline — ឯកសារក្នុង App', online: 'Online — បើក URL', autoRotate: 'ស្វ័យប្រវត្តិ',
      portrait: 'ឈរ (Portrait)', landscape: 'ដេក (Landscape)', permissions: 'Permissions',
      appIcon: 'App Icon (PNG)', clearIcon: 'យកចេញ', viewLog: '📜 មើល Log', buildIdle: 'មិនទាន់ build',
      history: 'ប្រវត្តិ build', settings: 'ការកំណត់', theme: 'ពណ៌ផ្ទៃ', dark: 'Dark', light: 'Light',
      fontSize: 'ទំហំអក្សរ', tabSize: 'Tab size', wordWrap: 'បត់បន្ទាត់ (word wrap)',
      autosave: 'រក្សាទុកស្វ័យប្រវត្តិ', liveReload: 'Preview ថ្មីពេល save', language: 'ភាសា',
      deleteProject: '🗑 លុបគម្រោងនេះ', classic: 'ប្រអប់បង្កើត App បែបចាស់ →', chat: 'Buffy Chat →',
      preview: 'Live Preview', problems: 'បញ្ហា', output: 'Output', buildLog: 'Build log',
      cancel: 'បោះបង់', ok: 'យល់ព្រម', downloadFile: '⬇ ឯកសារនេះ', replace: 'ជំនួស',
      replaceAll: 'ជំនួសទាំងអស់', templates: '🧩 Template',
      cleanupRepos: '🗑 លុប repo សាកល្បង', listRepos: '🔄 រាយ repo សាកល្បង',
      deleteSelected: '🗑 លុបដែលជ្រើស',
      cleanupHint: 'លុបបានតែ repo ឈ្មោះ <pkg>-apk-<ពេលវេលា>។ ត្រូវការ ADMIN_KEY នៅ server។'
    } : {
      newProject: '＋ New', import: '⬆ Import', export: '⬇ ZIP', run: '▶ Run', buildApk: '🤖 Build APK',
      explorer: 'Explorer', search: 'Search', buildTitle: 'Build APK', appName: 'App name',
      versionName: 'Version', versionCode: 'Build', mode: 'Run mode', orientation: 'Orientation',
      offline: 'Offline — bundled files', online: 'Online — load a URL', autoRotate: 'Automatic',
      portrait: 'Portrait', landscape: 'Landscape', permissions: 'Permissions',
      appIcon: 'App Icon (PNG)', clearIcon: 'Remove', viewLog: '📜 View log', buildIdle: 'Not built yet',
      history: 'Build history', settings: 'Settings', theme: 'Theme', dark: 'Dark', light: 'Light',
      fontSize: 'Font size', tabSize: 'Tab size', wordWrap: 'Word wrap',
      autosave: 'Auto save', liveReload: 'Reload preview on save', language: 'Language',
      deleteProject: '🗑 Delete this project', classic: 'Classic app builder →', chat: 'Buffy Chat →',
      preview: 'Live Preview', problems: 'Problems', output: 'Output', buildLog: 'Build log',
      cancel: 'Cancel', ok: 'OK', downloadFile: '⬇ This file', replace: 'Replace',
      replaceAll: 'Replace all', templates: '🧩 Templates',
      cleanupRepos: '🗑 Delete test repos', listRepos: '🔄 List test repos',
      deleteSelected: '🗑 Delete selected',
      cleanupHint: 'Only repos named <pkg>-apk-<time> can be deleted. Needs ADMIN_KEY on the server.'
    };
    $$('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
  }

  /* ─────────────────────────────── UI wiring ───────────────────────────── */

  function showPanel(name) {
    $$('.act[data-panel]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-panel') === name));
    $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'panel-' + name));
    if (window.innerWidth <= 900) $('#sidebar').classList.add('open');
  }

  function closeSidebar() {
    if (window.innerWidth <= 900) $('#sidebar').classList.remove('open');
  }

  function showBottom(name) {
    $('#bottom').classList.remove('collapsed');
    $$('.btab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-b') === name));
    $$('.out').forEach((o) => o.classList.toggle('on', o.id === name));
  }

  function showPreview(force) {
    const pane = $('#previewPane');
    const on = typeof force === 'boolean' ? force : !pane.classList.contains('show');
    if (window.innerWidth <= 900) {
      pane.classList.toggle('show', on);
    } else {
      pane.hidden = !on;
    }
    if (on) reloadPreview();
  }

  /* ───────────────── editor extras: completion, format, definition ───────────────── */

  /* Project-wide symbols make the list useful across files, not just the
     current one; every word is read from the project, never invented. */
  const DECL = /\b(?:fun|class|struct|enum|interface|def|function|const|let|var|type|object|protocol)\s+([A-Za-z_$][\w$]{1,40})/g;

  function symbolBank() {
    const words = {};
    Object.keys(state.files).forEach((p) => {
      const text = (state.files[p] || {}).text;
      if (typeof text !== 'string') return;
      let m;
      DECL.lastIndex = 0;
      while ((m = DECL.exec(text)) !== null) words[m[1]] = 1;
    });
    return Object.keys(words);
  }

  const ac = { items: [], index: 0 };

  function hideAc() {
    const box = $('#acBox');
    if (box) box.hidden = true;
    ac.items = [];
    ac.index = 0;
  }

  function markAc() {
    const box = $('#acBox');
    if (!box) return;
    Array.prototype.forEach.call(box.children, (el, i) => {
      el.classList.toggle('on', i === ac.index);
    });
  }

  function showAc() {
    const box = $('#acBox');
    if (!box || !state.editor || !state.active) return;
    const at = state.editor.wordAt();
    if (at.word.length < 2) { hideAc(); return; }
    const res = state.editor.complete(symbolBank());
    ac.items = res.items;
    ac.index = 0;
    if (!res.items.length) { hideAc(); return; }
    box.innerHTML = res.items.map((it, i) =>
      '<div class="ac-item' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' +
      '<b>' + esc(it.text) + '</b><small>' + esc(it.kind) + '</small></div>').join('');
    // Anchor under the caret line so the list appears where the user is typing.
    const ta = $('#code');
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length;
    box.style.top = Math.max(0, Math.min(ta.clientHeight - 60,
      ta.offsetTop + (line - 1) * lh - ta.scrollTop + lh)) + 'px';
    box.style.left = '16px';
    box.hidden = false;
  }

  function acceptAc(i) {
    const item = ac.items[i];
    if (!item) return;
    hideAc();
    state.editor.insertCompletion(item.text);
  }

  function formatDoc() {
    if (!state.active) { toast('បើកឯកសារមុនសិន', 'err'); return; }
    const changed = state.editor.format();
    toast(changed ? 'តម្រឹមរួច — ' + window.IdeEditor.langName(state.active)
                  : 'គ្មានអ្វីត្រូវតម្រឹម', changed ? 'ok' : '');
  }

  /* Jumps to the first place the word under the caret is declared. */
  async function gotoDefinition() {
    if (!state.active) return;
    const at = state.editor.wordAt();
    if (!at.word) { toast('ដាក់ cursor លើឈ្មោះមុនសិន', 'err'); return; }
    const sym = at.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b(?:fun|class|struct|enum|interface|def|function|const|let|var|type|object|protocol)' +
      '\\s+' + sym + '\\b');
    const files = state.list.filter((f) => !f.binary);
    for (const f of files) {
      let text = (state.files[f.path] || {}).text;
      if (typeof text !== 'string') {
        try {
          const r = await api(projectApi('/file') + '?path=' + encodeURIComponent(f.path));
          text = r.text;
        } catch (e) { continue; }
      }
      const m = re.exec(text);
      if (m) {
        const line = text.slice(0, m.index).split('\n').length;
        await openFile(f.path, line);
        toast('→ ' + f.path + ' : ' + line, 'ok');
        return;
      }
    }
    toast('រកកន្លែងប្រកាស "' + at.word + '" មិនឃើញ', 'err');
  }

  function bindUi() {
    $$('.act[data-panel]').forEach((b) => b.addEventListener('click', () => showPanel(b.getAttribute('data-panel'))));
    $('#btnPreviewToggle').addEventListener('click', () => showPreview());
    $('#pvHide').addEventListener('click', () => showPreview(false));
    $('#pvDesktop').addEventListener('click', () => {
      $('#frameWrap').classList.remove('mobile');
      $('#pvDesktop').classList.add('on');
      $('#pvMobile').classList.remove('on');
    });
    $('#pvMobile').addEventListener('click', () => {
      $('#frameWrap').classList.add('mobile');
      $('#pvMobile').classList.add('on');
      $('#pvDesktop').classList.remove('on');
    });
    $('#pvReload').addEventListener('click', reloadPreview);
    $('#btnRun').addEventListener('click', () => { showPreview(true); reloadPreview(); });

    $('#btnNew').addEventListener('click', createEmptyProject);
    $('#emptyNew').addEventListener('click', createEmptyProject);
    $('#emptyTemplate').addEventListener('click', chooseTemplate);
    $('#emptyImport').addEventListener('click', () => $('#zipInput').click());
    $('#btnImport').addEventListener('click', () => $('#zipInput').click());
    $('#btnExport').addEventListener('click', exportZip);
    $('#btnBuild').addEventListener('click', () => { showPanel('build'); startBuild(); });
    $('#btnTheme').addEventListener('click', () => {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      applySettings(); saveSettings();
    });
    $('#btnLang').addEventListener('click', () => {
      state.settings.lang = state.settings.lang === 'km' ? 'en' : 'km';
      applySettings(); saveSettings();
    });
    $('#btnHelp').addEventListener('click', () => {
      ask({ title: 'ជំនួយរហ័ស', hint: 'Ctrl+S save · Ctrl+F find · Ctrl+P quick open · Tab indent · Preview = index.html' });
    });

    $('#projName').addEventListener('change', async () => {
      const name = $('#projName').value.trim() || 'គម្រោងថ្មី';
      state.proj.name = name;
      saveLocal();
      toast('ឈ្មោះគម្រោង: ' + name, 'ok');
    });

    $('#btnNewFile').addEventListener('click', () => newFilePrompt());
    if ($('#emptyNewFile')) $('#emptyNewFile').addEventListener('click', () => newFilePrompt());
    $('#btnNewFolder').addEventListener('click', () => newFolderPrompt());
    if ($('#btnAddFileHere')) $('#btnAddFileHere').addEventListener('click', () => newFilePrompt(state.selectedDir));
    if ($('#btnAddFolderHere')) $('#btnAddFolderHere').addEventListener('click', () => newFolderPrompt(state.selectedDir));
    if ($('#dirTargetClear')) $('#dirTargetClear').addEventListener('click', () => { state.selectedDir = ''; renderTree(); });
    $('#btnRefresh').addEventListener('click', async () => {
      try { await refreshList(); toast('ធ្វើបច្ចុប្បន្នភាពរួច', 'ok'); } catch (e) { toast(e.message, 'err'); }
    });
    $('#btnUpload').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', async (e) => {
      const files = Array.prototype.slice.call(e.target.files || []);
      if (files.length) await uploadFiles(files);
      e.target.value = '';
    });
    $('#zipInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { await importZip(file); } catch (err) { toast(err.message, 'err'); }
    });
    $('#btnDownloadFile').addEventListener('click', downloadActive);
    $('#btnDeleteProject').addEventListener('click', async () => {
      if (!window.confirm('លុបគម្រោងទាំងស្រុង? មិនអាចត្រឡប់វិញបានទេ។')) return;
      try {
        await api(projectApi(), { method: 'DELETE' });
        localStorage.removeItem(LS.proj);
        localStorage.removeItem(LS.files);
        location.reload();
      } catch (e) { toast(e.message, 'err'); }
    });

    $('#tree').addEventListener('click', async (e) => {
      const addFile = e.target.closest('[data-addfile]');
      if (addFile) {
        e.stopPropagation();
        state.selectedDir = addFile.getAttribute('data-addfile');
        renderTree();
        newFilePrompt(state.selectedDir);
        return;
      }
      const addDir = e.target.closest('[data-addfolder]');
      if (addDir) {
        e.stopPropagation();
        state.selectedDir = addDir.getAttribute('data-addfolder');
        renderTree();
        newFolderPrompt(state.selectedDir);
        return;
      }
      const more = e.target.closest('[data-more]');
      if (more) {
        e.stopPropagation();
        state.selectedDir = more.getAttribute('data-dir') ? more.getAttribute('data-more') : '';
        renderTree();
        openMenu(more.getAttribute('data-more'), more);
        return;
      }
      if (e.target.closest('.ctx')) return;
      const row = e.target.closest('.tree-row');
      if (!row) {
        if (state.selectedDir) { state.selectedDir = ''; renderTree(); }
        return;
      }
      const path = row.getAttribute('data-path');
      if (row.getAttribute('data-kind') === 'dir') {
        if (state.selectedDir !== path) {
          state.selectedDir = path;
          delete state.collapsed[path];
        } else {
          state.collapsed[path] = !state.collapsed[path];
        }
        renderTree();
      } else {
        try { await openFile(path); } catch (err) { toast(err.message, 'err'); }
      }
    });

    $('#tabs').addEventListener('click', (e) => {
      const close = e.target.closest('[data-close]');
      if (close) { closeTab(close.getAttribute('data-close')); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) openFile(tab.getAttribute('data-tab')).catch(() => {});
    });

    $('#searchInput').addEventListener('input', runSearch);
    $('#btnReplaceAll').addEventListener('click', replaceAll);
    $('#searchResults').addEventListener('click', (e) => {
      const row = e.target.closest('[data-open]');
      if (!row) return;
      openFile(row.getAttribute('data-open'), parseInt(row.getAttribute('data-line'), 10)).catch(() => {});
    });

    // find bar — plain text or regex, case toggle and a live match counter
    const findOpts = () => ({
      regex: $('#findRegex').classList.contains('on'),
      caseSensitive: $('#findCase').classList.contains('on')
    });
    const countHits = () => {
      const q = $('#findInput').value;
      if (!state.editor || !q) { $('#findCount').textContent = '0/0'; return 0; }
      const hits = state.editor.searchAll(q, findOpts());
      $('#findCount').textContent = (state.editor.findIndex >= 0 ? state.editor.findIndex + 1 : 0) + '/' + hits.length;
      return hits.length;
    };
    const doFind = (backward) => {
      const q = $('#findInput').value;
      if (!q) return;
      const r = state.editor.find(q, Object.assign({ backward: backward }, findOpts()));
      if (!r) { $('#findCount').textContent = '0/0'; toast('រកមិនឃើញ: ' + q, 'err'); return; }
      $('#findCount').textContent = r.index + '/' + r.count;
    };
    $('#findClose').addEventListener('click', () => { $('#findBar').hidden = true; state.editor.focus(); });
    $('#findNext').addEventListener('click', () => doFind(false));
    $('#findPrev').addEventListener('click', () => doFind(true));
    $('#findCase').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); countHits(); });
    $('#findRegex').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); countHits(); });
    $('#findInput').addEventListener('input', countHits);
    $('#findReplaceOne').addEventListener('click', () => {
      if (!state.editor.replaceOne($('#findInput').value, $('#findReplace').value, findOpts())) return;
      countHits();
    });
    $('#findReplaceAll').addEventListener('click', () => {
      const q = $('#findInput').value;
      if (!q) return;
      const n = state.editor.replaceAll(q, $('#findReplace').value, findOpts());
      if (!n) { toast('រកមិនឃើញ: ' + q, 'err'); return; }
      toast('ជំនួស ' + n + ' កន្លែង', 'ok');
      countHits();
    });
    $('#findInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doFind(e.shiftKey); }
      if (e.key === 'Escape') { e.preventDefault(); $('#findBar').hidden = true; state.editor.focus(); }
    });

    // go to line, language switcher
    const gotoLinePrompt = () => {
      if (!state.active) { toast('បើកឯកសារមុនសិន', 'err'); return; }
      ask({ title: 'ទៅបន្ទាត់', hint: 'លេខបន្ទាត់ (1–' + state.editor.lines.length + ')', value: String(state.editor.caret ? state.editor.caret.line : 1) })
        .then((v) => {
          const n = parseInt(v, 10);
          if (!n) return;
          const at = state.editor.gotoLine(n);
          $('#stPos').textContent = 'Ln ' + at + ', Col 1';
        });
    };
    $('#stLang').addEventListener('click', () => {
      if (!state.active) return;
      const detected = window.IdeEditor.langOf(state.active);
      const opts = [{ value: 'auto', label: 'Auto — ' + window.IdeEditor.langLabel(detected) + ' (តាមកន្ទុយឯកសារ)' }]
        .concat(window.IdeEditor.languages.map((l) => ({ value: l.id, label: l.label })));
      ask({ title: 'ភាសារបស់ឯកសារ', hint: state.active, options: opts, value: langOverride(state.active) })
        .then((id) => {
          if (!id) return;
          setLangOverride(state.active, id);
          state.editor.setLang(state.active, id);
          $('#stLang').textContent = window.IdeEditor.langLabel(state.editor.lang);
          toast('ភាសា: ' + window.IdeEditor.langLabel(state.editor.lang), 'ok');
        });
    });

    // editor tools: completion list, auto-indent, go to definition
    $('#code').addEventListener('input', debounce(showAc, 140));
    $('#code').addEventListener('blur', () => setTimeout(hideAc, 120));
    $('#acBox').addEventListener('mousedown', (e) => {
      const row = e.target.closest('[data-i]');
      if (!row) return;
      e.preventDefault();
      acceptAc(parseInt(row.getAttribute('data-i'), 10) || 0);
    });
    $('#code').addEventListener('keydown', (e) => {
      const box = $('#acBox');
      const open = box && !box.hidden && ac.items.length;
      if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        ac.index = (ac.index + (e.key === 'ArrowDown' ? 1 : ac.items.length - 1)) % ac.items.length;
        markAc();
        return;
      }
      if (open && (e.key === 'Enter' || e.key === 'Tab')) {
        e.preventDefault();
        acceptAc(ac.index);
        return;
      }
      if (e.key === 'Escape' && open) { e.preventDefault(); hideAc(); }
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); showAc(); }
    }, true);

    // bottom panel
    $('#problems').addEventListener('click', (e) => {
      const row = e.target.closest('[data-file]');
      if (!row) return;
      openFile(row.getAttribute('data-file'), parseInt(row.getAttribute('data-line'), 10) || 0).catch(() => {});
    });
    $$('.btab').forEach((b) => b.addEventListener('click', () => showBottom(b.getAttribute('data-b'))));
    $('#bottomClose').addEventListener('click', () => $('#bottom').classList.add('collapsed'));

    // build
    $('#btnStartBuild').addEventListener('click', startBuild);
    $('#btnRefreshLog').addEventListener('click', refreshLogs);
    $('#btnClearHistory').addEventListener('click', () => {
      state.history = [];
      try { localStorage.removeItem(LS.history); } catch (e) {}
      renderHistory();
    });
    // cleanup of build repos — the key never leaves this page's memory
    $('#btnCleanup').addEventListener('click', () => {
      const box = $('#cleanupBox');
      box.hidden = !box.hidden;
      if (!box.hidden) $('#adminKey').focus();
    });
    $('#btnListRepos').addEventListener('click', listBuildRepos);
    $('#btnDeleteRepos').addEventListener('click', deleteSelectedRepos);
    $('#bMode').addEventListener('change', () => {
      $('#bUrl').hidden = $('#bMode').value !== 'online';
    });
    $('#bName').addEventListener('input', () => {
      const pkg = $('#bPkg');
      if (!pkg.value || pkg.dataset.auto !== 'off') pkg.value = G.normalize({ name: $('#bName').value }).pkg;
    });
    $('#bPkg').addEventListener('input', () => { $('#bPkg').dataset.auto = 'off'; });

    // settings
    $('#setTheme').addEventListener('change', () => { state.settings.theme = $('#setTheme').value; applySettings(); saveSettings(); });
    $('#setFont').addEventListener('change', () => { state.settings.fontSize = parseInt($('#setFont').value, 10) || 13; applySettings(); saveSettings(); });
    $('#setTab').addEventListener('change', () => { state.settings.tabSize = parseInt($('#setTab').value, 10) || 2; applySettings(); saveSettings(); });
    $('#setWrap').addEventListener('change', () => { state.settings.wrap = $('#setWrap').checked; applySettings(); saveSettings(); });
    $('#setAuto').addEventListener('change', () => { state.settings.auto = $('#setAuto').checked; saveSettings(); });
    $('#setLive').addEventListener('change', () => { state.settings.live = $('#setLive').checked; saveSettings(); });
    $('#setLang').addEventListener('change', () => { state.settings.lang = $('#setLang').value; applySettings(); saveSettings(); });

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.active) saveFile(state.active).then(() => toast('រក្សាទុករួច', 'ok'));
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const bar = $('#findBar');
        bar.hidden = !bar.hidden;
        if (!bar.hidden) {
          $('#findInput').value = state.editor.code.value.slice(state.editor.code.selectionStart, state.editor.code.selectionEnd);
          $('#findInput').focus();
        }
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        gotoLinePrompt();
      } else if (mod && e.key === 'Tab') {
        e.preventDefault();
        if (state.open.length > 1) {
          const i = state.open.indexOf(state.active);
          const next = state.open[(i + (e.shiftKey ? -1 : 1) + state.open.length) % state.open.length];
          openFile(next);
        }
      } else if (mod && e.key.toLowerCase() === 'w') {
        if (state.active && !e.altKey) { e.preventDefault(); closeTab(state.active); }
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        ask({ title: 'បើកឯកសារ', hint: 'ជ្រើសឯកសារ', options: state.list.filter((f) => !f.binary).map((f) => ({ value: f.path, label: f.path })) })
          .then((p) => { if (p) openFile(p); });
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (Object.keys(state.dirty).length) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth > 900) {
        $('#sidebar').classList.remove('open');
        $('#previewPane').classList.remove('show');
      }
    }, 200));
  }

  function openMenu(path, anchor) {
    const old = document.querySelector('.ctx');
    if (old) old.remove();
    const isDir = !state.list.some((f) => f.path === path);
    const menu = document.createElement('div');
    menu.className = 'ctx';
    menu.style.cssText = 'position:fixed;z-index:80;background:var(--panel);border:1px solid var(--border-2);' +
      'border-radius:8px;box-shadow:var(--shadow);padding:4px;min-width:150px;font-size:12.5px';
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 170) + 'px';
    menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 190) + 'px';
    const items = (isDir
      ? [['📄 ឯកសារថ្មីក្នុងថតនេះ', () => newFilePrompt(path)],
         ['📁 ថតរងថ្មី', () => newFolderPrompt(path)]]
      : [['បើក', () => openFile(path)]]).concat([
      ['ប្តូរឈ្មោះ', async () => {
        const to = await ask({ title: 'ប្តូរឈ្មោះ', value: path });
        if (!to) return;
        try { await renameEntry(path, to); } catch (e) { toast(e.message, 'err'); }
      }],
      ['ទាញយក', () => {
        const meta = state.list.find((f) => f.path === path);
        if (meta && meta.binary) {
          window.open(projectApi('/asset') + '?path=' + encodeURIComponent(path) + '&key=' + encodeURIComponent(state.proj.key));
        } else {
          const prev = state.active;
          state.active = path;
          downloadActive();
          state.active = prev;
        }
      }],
      ['លុប', async () => {
        try { await deleteEntry(path); } catch (e) { toast(e.message, 'err'); }
      }]
    ].filter((it) => !(isDir && it[0] === 'ទាញយក')));
    items.forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;color:inherit;' +
        'padding:7px 9px;border-radius:5px;cursor:pointer;font-size:12.5px';
      b.onmouseenter = () => { b.style.background = 'var(--panel-2)'; };
      b.onmouseleave = () => { b.style.background = 'none'; };
      b.onclick = () => { menu.remove(); fn(); };
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function off(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off); }
      });
    }, 0);
  }

  async function chooseTemplate() {
    const id = await ask({
      title: 'ជ្រើស Template',
      hint: 'គម្រោងថ្មីនឹងបង្កើតជាមួយឯកសារទាំងនេះ',
      options: Object.keys(TEMPLATES).map((k) => ({ value: k, label: TEMPLATES[k].label }))
    });
    if (id) createWithTemplate(id);
  }

  /* ──────────────────────────────── boot ───────────────────────────────── */

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
      const langs = JSON.parse(localStorage.getItem(LS.langs) || '{}');
      if (langs && typeof langs === 'object') state.langs = langs;
    } catch (e) { /* defaults */ }
  }

  /* The language is detected from the file extension; clicking the status bar
     language lets the user override it for that one file and remembers it. */
  function langOverride(path) {
    return (path && state.langs[path]) || 'auto';
  }

  function setLangOverride(path, id) {
    if (!id || id === 'auto') delete state.langs[path];
    else state.langs[path] = id;
    try { localStorage.setItem(LS.langs, JSON.stringify(state.langs)); } catch (e) { /* quota */ }
  }

  function renderStatus(s) {
    if (!s) return;
    $('#stLang').textContent = s.langLabel;
    $('#stLang').title = 'ភាសា: ' + s.langLabel +
      (s.lang !== s.detected ? ' (ប្តូរដោយដៃ)' : ' (ស្វ័យប្រវត្តិតាមកន្ទុយឯកសារ)') +
      ' — ' + (s.encoding || 'UTF-8') + ', ' + s.eol;
    $('#stIndent').textContent = s.indent;
    $('#stEol').textContent = s.eol;
    $('#stEnc').textContent = s.encoding;
    if (s.large) $('#stStatus').textContent = '● ឯកសារធំ — បំភ្លឺតែផ្នែកដែលឃើញ';
    $('#editor').classList.toggle('has-folds', (s.folds || 0) > 0);
  }

  function loadSnapshot() {
    try {
      const proj = JSON.parse(localStorage.getItem(LS.proj) || 'null');
      const snap = JSON.parse(localStorage.getItem(LS.files) || 'null');
      if (proj && proj.id && proj.key) state.proj = proj;
      if (snap && snap.files) {
        Object.keys(snap.files).forEach((p) => { state.files[p] = { text: snap.files[p] }; });
      }
      if (snap && Array.isArray(snap.list)) state.list = snap.list;
    } catch (e) { /* first run */ }
    try {
      const hist = JSON.parse(localStorage.getItem(LS.history) || '[]');
      if (Array.isArray(hist)) state.history = hist;
    } catch (e) { /* ignore */ }
  }

  let booted = false;

  async function boot() {
    if (booted) return;
    booted = true;
    loadSettings();
    loadSnapshot();
    bindEditor();
    applySettings();
    bindUi();
    bindPreviewMessages();
    bindIcon();
    renderHistory();
    checkReady();

    $('#bName').value = (state.proj && state.proj.name) || 'AppForge App';
    $('#bPkg').value = G.normalize({ name: $('#bName').value }).pkg;
    $('#bVersion').value = '1.0';
    $('#bVersionCode') && ($('#bVersionCode').value = '1');

    try {
      await loadProject();
      if (state.list.length && await dropUntouchedTemplate()) {
        state.open = [];
        state.active = '';
        renderTabs();
      }
      $('#projName').value = state.proj.name;
      $('#projLabel').textContent = state.proj.name;
      $('#limitsHint').textContent = 'Project ' + state.proj.id.slice(0, 8) + '… · key រក្សាក្នុងឧបករណ៍នេះ';
      // Nothing is written on arrival: an empty project stays empty until the
      // user creates a file (or picks a template explicitly).
      if (state.list.length) {
        const first = state.list.find((f) => f.path === 'index.html') || state.list.find((f) => !f.binary);
        if (first) await openFile(first.path);
      } else {
        $('#emptyState').hidden = false;
        $('#editor').hidden = true;
        $('#tabs').hidden = true;
        $('#stPath').textContent = '—';
        $('#stLang').textContent = 'Text';
        renderTree();
        updateStats();
        setStatus('គ្មានឯកសារ — ចុច ＋ ដើម្បីបង្កើត', '');
      }
      reloadPreview();
      renderProblems();
      setStatus(state.list.length ? 'Ready' : 'គ្មានឯកសារ — ចុច ＋ ដើម្បីបង្កើត',
        state.list.length ? 'ok' : '');
      saveLocal();
    } catch (err) {
      state.offline = true;
      setStatus('Offline — server មិនឆ្លើយតប', 'err');
      toast('មិនអាចភ្ជាប់ server: ' + err.message, 'err');
      renderTree();
      renderProblems();
      const first = Object.keys(state.files)[0];
      if (first) {
        state.open = [first];
        state.active = first;
        state.editor.setLang(first);
        state.editor.setValue(state.files[first].text);
        $('#emptyState').hidden = true;
        $('#editor').hidden = false;
        renderTabs();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

/* ── current-line band ──────────────────────────────────────────────────────
   The textarea paints its own text transparently, so the band behind the
   caret line is a positioned div kept in step with the caret and scroll. */
(function currentLineBand() {
  const ta = document.getElementById('code');
  const bar = document.getElementById('curLine');
  const host = document.getElementById('editor');
  if (!ta || !bar || !host) return;
  let raf = 0;
  const wrap = ta.parentNode;
  function place() {
    raf = 0;
    if (host.hidden) { bar.hidden = true; return; }
    const upto = ta.value.slice(0, ta.selectionStart || 0);
    let line = 0;
    for (let i = 0; i < upto.length; i++) if (upto.charCodeAt(i) === 10) line += 1;
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) || 12;
    const top = pad + line * lh - (ta.scrollTop || 0);
    const viewH = wrap.clientHeight || 0;
    // A caret parked outside the visible window gets no band.
    if (top + lh < 0 || (viewH && top > viewH)) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.style.top = Math.round(top) + 'px';
    bar.style.height = Math.round(lh) + 'px';
    bar.style.width = Math.max(ta.clientWidth || 0, ta.scrollWidth || 0) + 'px';
  }
  function queue() { if (!raf) raf = requestAnimationFrame(place); }
  ['input', 'keyup', 'keydown', 'click', 'select', 'scroll', 'focus', 'paste'].forEach((ev) => ta.addEventListener(ev, queue));
  document.addEventListener('selectionchange', queue);
  window.addEventListener('resize', queue);
  if (window.MutationObserver) new MutationObserver(queue).observe(host, { attributes: true, attributeFilter: ['hidden'] });
  queue();
})();
