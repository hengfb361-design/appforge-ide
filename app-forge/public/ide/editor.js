/* AppForge editor engine.
   Hand-written lexers (no CDN, works offline and on a phone) that drive
   highlighting, folding, bracket matching and structural diagnostics.
   This is a lexer, not a compiler: only JSON (JSON.parse) and JavaScript
   (the browser's own parser) get a real parse — everything else is a
   structural scan and the Problems panel says so. */
(function () {
  'use strict';

  const LANGS = {
    html: ['html', 'htm', 'xhtml', 'vue', 'svg'],
    css: ['css', 'scss', 'less'],
    js: ['js', 'mjs', 'cjs', 'jsx'],
    ts: ['ts', 'tsx', 'mts', 'cts'],
    json: ['json', 'json5', 'geojson'],
    xml: ['xml', 'plist', 'svgxml'],
    yaml: ['yml', 'yaml'],
    java: ['java'],
    kotlin: ['kt', 'kts'],
    gradle: ['gradle'],
    c: ['c', 'h'],
    cpp: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ino'],
    rust: ['rs'],
    dart: ['dart'],
    csharp: ['cs'],
    go: ['go'],
    swift: ['swift'],
    python: ['py', 'pyw'],
    php: ['php', 'phtml'],
    shell: ['sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1'],
    sql: ['sql'],
    md: ['md', 'markdown', 'mdx'],
    props: ['properties', 'ini', 'toml', 'conf', 'cfg', 'env'],
    text: ['txt', 'log', 'pro', 'gitignore', 'cmake', 'mk', 'txt2']
  };

  const LANG_LABELS = {
    html: 'HTML', css: 'CSS', js: 'JavaScript', ts: 'TypeScript', json: 'JSON',
    xml: 'XML', yaml: 'YAML', java: 'Java', kotlin: 'Kotlin', gradle: 'Gradle',
    c: 'C', cpp: 'C++', rust: 'Rust', dart: 'Dart', csharp: 'C#', go: 'Go',
    swift: 'Swift', python: 'Python', php: 'PHP', shell: 'Shell', sql: 'SQL',
    md: 'Markdown', props: 'Properties', text: 'Plain text'
  };

  const COMMON = 'true false null';
  const KEYWORDS = {
    js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await ' + COMMON,
    ts: 'break case catch class const continue declare default delete do else export extends finally for function if implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies static super switch this throw try type typeof var void while with yield as async await enum abstract ' + COMMON,
    json: 'true false null',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits ' + COMMON,
    kotlin: 'abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package param private protected public reified return sealed set super suspend tailrec this throw try typealias val value var vararg when where while ' + COMMON,
    gradle: 'apply buildscript dependencies ext from id implementation plugins repositories task ' + COMMON,
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while ' + COMMON + ' NULL',
    cpp: 'alignas alignof asm auto bool break case catch char class const constexpr continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static static_cast struct switch template this throw try typedef typeid typename union unsigned using virtual void volatile while ' + COMMON,
    rust: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while ' + COMMON,
    dart: 'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for Function get hide if implements import in interface is late library mixin new on operator part required rethrow return set show static super switch sync this throw try typedef var void when while with yield ' + COMMON,
    csharp: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await record ' + COMMON,
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var ' + COMMON + ' nil iota',
    swift: 'associatedtype break case catch class continue default defer deinit do else enum extension fallthrough for func guard if import in init inout internal let open operator override private protocol public repeat rethrows return self Self static struct subscript super switch throw throws try typealias var where while ' + COMMON + ' nil',
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return True False try while with yield self match case print',
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield ' + COMMON,
    shell: 'alias break case cd continue do done elif else esac eval exec exit export fi for function if in local printf read return set shift source then until while echo sudo ' + COMMON,
    sql: 'add all alter and as asc begin between by case change column commit constraint create database default delete desc distinct drop else end exists from group having if in index inner insert into is join key left like limit not null on or order outer primary references right rollback select set table then union unique update values view when where with ' + COMMON,
    yaml: 'true false null yes no on off',
    xml: 'xml version encoding standalone',
    css: 'important media supports keyframes font-face import charset page root',
    html: 'html head body div span script style link meta title class id href src',
    md: '',
    props: '',
    text: ''
  };

  /* Types get their own colour so `String` does not look like a variable. */
  const TYPES = {
    java: 'String int long double float boolean char byte short void Object List Map Set Integer Boolean',
    kotlin: 'String Int Long Double Float Boolean Char Byte Short Unit Any List Map Set Array',
    c: 'int long double float char void short unsigned signed size_t FILE',
    cpp: 'int long double float char void bool short unsigned signed size_t string vector map',
    csharp: 'int long double float bool char byte short string object decimal var void',
    go: 'int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error',
    rust: 'i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 bool char str String Vec Option Result',
    swift: 'Int Double Float Bool String Character Array Dictionary Optional',
    dart: 'int double num bool String List Map Set dynamic Object',
    ts: 'string number boolean any unknown never void object bigint symbol',
    js: 'Number String Boolean Object Array Promise Map Set Date RegExp Error',
    php: 'int float string bool array object callable iterable void mixed'
  };

  const SYNTAX = {
    js: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['`'], dotProps: true },
    ts: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['`'], dotProps: true },
    java: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], decorator: true, dotProps: true },
    kotlin: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['"""'], decorator: true, dotProps: true },
    gradle: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['"""', "'''"], dotProps: true },
    c: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], preproc: true },
    cpp: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], preproc: true, dotProps: true },
    rust: { line: ['//'], block: [['/*', '*/']], quotes: ['"'], charLit: true, dotProps: true },
    dart: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['"""', "'''"], decorator: true, dotProps: true },
    csharp: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['@"'], dotProps: true },
    go: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'"], multi: ['`'], dotProps: true },
    swift: { line: ['//'], block: [['/*', '*/']], quotes: ['"'], multi: ['"""'], decorator: true, dotProps: true },
    php: { line: ['//', '#'], block: [['/*', '*/']], quotes: ['"', "'"], dotProps: true },
    python: { line: ['#'], quotes: ['"', "'"], multi: ['"""', "'''"] },
    shell: { line: ['#'], quotes: ['"', "'"], multi: ['`'], shell: true },
    sql: { line: ['--'], block: [['/*', '*/']], quotes: ["'", '"'], ci: true },
    props: { line: ['#', ';'], quotes: ['"', "'"] },
    yaml: { line: ['#'], quotes: ['"', "'"] },
    json: {},
    css: { block: [['/*', '*/']], quotes: ['"', "'"] },
    html: { block: [['<!--', '-->']] },
    xml: { block: [['<!--', '-->']] },
    md: {},
    text: {}
  };

  const FAMILY = {
    js: 'clike', ts: 'clike', java: 'clike', kotlin: 'clike', gradle: 'clike',
    c: 'clike', cpp: 'clike', rust: 'clike', dart: 'clike', csharp: 'clike',
    go: 'clike', swift: 'clike', php: 'clike',
    json: 'json', html: 'html', xml: 'html', css: 'css', yaml: 'yaml',
    md: 'md', python: 'python', shell: 'shell', sql: 'sql', props: 'props',
    text: 'text'
  };

  const VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };

  function langOf(path) {
    const name = String(path || '').split('/').pop();
    const ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : name.toLowerCase();
    if (/^build\.gradle\.kts$|^settings\.gradle\.kts$/.test(name)) return 'kotlin';
    for (const key in LANGS) {
      if (LANGS[key].indexOf(ext) >= 0) return key;
    }
    return 'text';
  }

  function langLabel(id) {
    return LANG_LABELS[id] || LANG_LABELS[langOf(id)] || 'Plain text';
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  const TOKEN_CLASS = { kw: 'key', plain: 'plain' };

  function span(cls, text) {
    return '<span class="tok-' + (TOKEN_CLASS[cls] || cls) + '">' + esc(text) + '</span>';
  }

  function setOf(str) {
    const s = Object.create(null);
    String(str || '').split(/\s+/).forEach((w) => { if (w) s[w] = 1; });
    return s;
  }

  const KW = {};
  const TY = {};
  Object.keys(KEYWORDS).forEach((k) => { KW[k] = setOf(KEYWORDS[k]); });
  Object.keys(TYPES).forEach((k) => { TY[k] = setOf(TYPES[k]); });

  /* ───────────────────────────── core lexer ─────────────────────────────── */

  const BLANK_STATE = () => ({ mode: null, close: null, tag: null, raw: null, fence: null });

  const ID_START = /[A-Za-z_$@]/;
  const ID_RE = /^[A-Za-z_$][\w$]*/;
  const NUM_RE = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)(?:[a-zA-Z_]\w*)?/;
  const OPS = '{}()[];,.<>=+-*/%!&|^~?:';

  /* Code-family scanner shared by C-like, Python, shell, SQL and properties.
     The state carries multi-line comments and strings so a `/*` on one line
     stops the next line being painted as code. */
  function scanCode(line, st, lang) {
    const cfg = SYNTAX[lang] || {};
    const kw = KW[lang] || {};
    const ty = TY[lang] || {};
    const ci = !!cfg.ci;
    const out = [];
    let i = 0;
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    const lower = (s) => (ci ? s.toLowerCase() : s);

    while (i < line.length) {
      if (st.mode === 'block') {
        const at = line.indexOf(st.close, i);
        if (at < 0) { put('com', line.slice(i)); return { tokens: out, state: st }; }
        put('com', line.slice(i, at + st.close.length));
        i = at + st.close.length;
        st.mode = null; st.close = null;
        continue;
      }
      if (st.mode === 'str') {
        let j = i, closed = false;
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue; }
          if (line.startsWith(st.close, j)) { j += st.close.length; closed = true; break; }
          j++;
        }
        j = Math.min(j, line.length);
        put('str', line.slice(i, j));
        i = j;
        if (closed) { st.mode = null; st.close = null; }
        continue;
      }
      const ch = line[i];
      if (/\s/.test(ch)) {
        let j = i;
        while (j < line.length && /\s/.test(line[j])) j++;
        put('plain', line.slice(i, j));
        i = j;
        continue;
      }
      const lc = (cfg.line || []).find((c) => line.startsWith(c, i));
      if (lc) { put('com', line.slice(i)); break; }
      const bc = (cfg.block || []).find((b) => line.startsWith(b[0], i));
      if (bc) {
        const at = line.indexOf(bc[1], i + bc[0].length);
        if (at < 0) { put('com', line.slice(i)); st.mode = 'block'; st.close = bc[1]; return { tokens: out, state: st }; }
        put('com', line.slice(i, at + bc[1].length));
        i = at + bc[1].length;
        continue;
      }
      const multi = (cfg.multi || []).find((q) => line.startsWith(q, i));
      const single = (cfg.quotes || []).find((q) => line.startsWith(q, i));
      const q = multi || single;
      if (q) {
        const startCol = i;
        const multiline = !!multi;
        let j = i + q.length, closed = false;
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue; }
          if (q.length === 1 && line[j] === q) { j += 1; closed = true; break; }
          if (q.length > 1 && line.startsWith(q, j)) { j += q.length; closed = true; break; }
          j++;
        }
        j = Math.min(j, line.length);
        put('str', line.slice(i, j));
        i = j;
        if (!closed && multiline) { st.mode = 'str'; st.close = q; }
        // A quote that cannot span lines and is never closed is a real error.
        else if (!closed && !multiline) st.badString = { col: startCol + 1 };
        continue;
      }
      if (cfg.charLit && ch === "'") {
        const m = /^'(?:\\.|[^'\\\n])'/.exec(line.slice(i));
        if (m) { put('str', m[0]); i += m[0].length; continue; }
        put('plain', ch); i++; continue;
      }
      if (cfg.preproc && ch === '#' && /^#\s*[a-zA-Z]/.test(line.slice(i))) {
        put('attr', line.slice(i)); break;
      }
      if (cfg.shell && ch === '$') {
        const m = /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|\d|[@#?$!*-])/.exec(line.slice(i));
        if (m) { put('var', m[0]); i += m[0].length; continue; }
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] || ''))) {
        const m = NUM_RE.exec(line.slice(i));
        if (m) { put('num', m[0]); i += m[0].length; continue; }
      }
      if (ID_START.test(ch)) {
        if (cfg.decorator && ch === '@') {
          const m = /^@[\w.]+/.exec(line.slice(i));
          if (m) { put('attr', m[0]); i += m[0].length; continue; }
        }
        const m = ID_RE.exec(line.slice(i));
        const w = m[0];
        let cls = null;
        if (kw[lower(w)]) cls = 'kw';
        else if (ty[w]) cls = 'fn';
        else if (/^\s*\(/.test(line.slice(i + w.length))) cls = 'fn';
        else if (cfg.dotProps && /\.\s*$/.test(line.slice(0, i))) cls = 'attr';
        put(cls || 'plain', w);
        i += w.length;
        continue;
      }
      if (OPS.indexOf(ch) >= 0) {
        const m = /^(?:=>|->|::|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\.\.\.|\+=|-=|\*=|\/=|%=|\+\+|--)/.exec(line.slice(i));
        put('op', m ? m[0] : ch);
        i += m ? m[0].length : 1;
        continue;
      }
      put('plain', ch);
      i++;
    }
    return { tokens: out, state: st };
  }

  /* JSON: keys are strings before a colon, so they get the attribute colour. */
  function scanJson(line, st) {
    const out = [];
    let i = 0;
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    while (i < line.length) {
      const ch = line[i];
      if (/\s/.test(ch)) { let j = i; while (j < line.length && /\s/.test(line[j])) j++; put('plain', line.slice(i, j)); i = j; continue; }
      if (ch === '"') {
        let j = i + 1;
        while (j < line.length) { if (line[j] === '\\') { j += 2; continue; } if (line[j] === '"') { j++; break; } j++; }
        const text = line.slice(i, Math.min(j, line.length));
        put(/^\s*:/.test(line.slice(j)) ? 'attr' : 'str', text);
        i = Math.min(j, line.length);
        if (i >= line.length && text[text.length - 1] !== '"') { st.mode = 'str'; st.close = '"'; }
        continue;
      }
      if (/[0-9-]/.test(ch)) {
        const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(line.slice(i));
        if (m) { put('num', m[0]); i += m[0].length; continue; }
      }
      const m = /^(true|false|null)\b/.exec(line.slice(i));
      if (m) { put('num', m[0]); i += m[0].length; continue; }
      if ('{}[],:'.indexOf(ch) >= 0) { put('op', ch); i++; continue; }
      put('plain', ch); i++;
    }
    return { tokens: out, state: st };
  }

  /* YAML is line-structured: keys, list dashes, values, anchors. */
  function scanYaml(line, st) {
    const out = [];
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    const lead = /^\s*/.exec(line)[0];
    let i = lead.length;
    put('plain', lead);
    if (line[i] === '#') { put('com', line.slice(i)); return { tokens: out, state: st }; }
    if (line[i] === '-' && (line[i + 1] === ' ' || line[i + 1] === undefined)) { put('op', '-'); i++; }
    const key = /^([^\s:#][^:#]*?)(\s*:)(?=\s|$)/.exec(line.slice(i));
    if (key) {
      put('attr', key[1]);
      put('op', key[2]);
      i += key[0].length;
    }
    while (i < line.length) {
      const ch = line[i];
      if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) { put('com', line.slice(i)); break; }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < line.length) { if (line[j] === '\\' && ch === '"') { j += 2; continue; } if (line[j] === ch) { j++; break; } j++; }
        put('str', line.slice(i, j)); i = j; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(line[i + 1] || ''))) {
        const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(line.slice(i));
        if (m) { put('num', m[0]); i += m[0].length; continue; }
      }
      if (ch === '&' || ch === '*') { const m = /^[&*][\w-]+/.exec(line.slice(i)); if (m) { put('var', m[0]); i += m[0].length; continue; } }
      if (ch === '|' || ch === '>') { put('op', ch); i++; continue; }
      const m = /^[A-Za-z_][\w. <>/-]*/.exec(line.slice(i));
      if (m) {
        const w = m[0].replace(/\s+$/, '');
        put(KW.yaml[w.toLowerCase()] ? 'kw' : 'plain', w);
        i += w.length;
        continue;
      }
      put('plain', ch); i++;
    }
    return { tokens: out, state: st };
  }

  /* Properties / INI / TOML: sections, keys, values. */
  function scanProps(line, st) {
    const out = [];
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    const lead = /^\s*/.exec(line)[0];
    put('plain', lead);
    let i = lead.length;
    if (line[i] === '#' || line[i] === ';' || line[i] === '!') { put('com', line.slice(i)); return { tokens: out, state: st }; }
    const sec = /^\[[^\]]*\]/.exec(line.slice(i));
    if (sec) { put('tag', sec[0]); i += sec[0].length; }
    else {
      const kv = /^([^=:]+)([=:])/.exec(line.slice(i));
      if (kv) { put('attr', kv[1].trim()); put('plain', line.slice(i + kv[1].length, i + kv[0].length)); i += kv[0].length; }
    }
    while (i < line.length) {
      const ch = line[i];
      if (ch === '#' || ch === ';') { put('com', line.slice(i)); break; }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < line.length) { if (line[j] === '\\') { j += 2; continue; } if (line[j] === ch) { j++; break; } j++; }
        put('str', line.slice(i, j)); i = j; continue;
      }
      if (/[0-9]/.test(ch)) { const m = /^\d+(?:\.\d+)?/.exec(line.slice(i)); put('num', m[0]); i += m[0].length; continue; }
      const m = /^[^\s#;"'=:]+/.exec(line.slice(i));
      if (m) {
        const w = m[0];
        const low = w.toLowerCase();
        put((low === 'true' || low === 'false' || low === 'null' || low === 'yes' || low === 'no') ? 'num' : 'plain', w);
        i += w.length;
        continue;
      }
      put('plain', ch); i++;
    }
    return { tokens: out, state: st };
  }

  /* HTML/XML: comments, doctype, tags, attributes, and real <script>/<style>
     bodies handed to the JS and CSS lexers. */
  function scanHtml(line, st, lang) {
    const out = [];
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    let i = 0;
    const rawLang = st.raw;
    if (rawLang) {
      const close = '</' + st.raw;
      const at = line.toLowerCase().indexOf(close);
      const body = at < 0 ? line : line.slice(0, at);
      const res = rawLang === 'js' ? scanCode(body, st.rawState || (st.rawState = BLANK_STATE()), 'js')
        : scanCode(body, st.rawState || (st.rawState = BLANK_STATE()), 'css');
      res.tokens.forEach((t) => out.push(t));
      st.rawState = res.state;
      if (at < 0) return { tokens: out, state: st };
      i = at;
      st.raw = null; st.rawState = null;
    }
    while (i < line.length) {
      if (st.mode === 'block') {
        const at = line.indexOf(st.close, i);
        if (at < 0) { put('com', line.slice(i)); return { tokens: out, state: st }; }
        put('com', line.slice(i, at + st.close.length));
        i = at + st.close.length; st.mode = null; st.close = null;
        continue;
      }
      const ch = line[i];
      if (ch === '<') {
        if (line.startsWith('<!--', i)) {
          const end = line.indexOf('-->', i + 4);
          if (end < 0) { put('com', line.slice(i)); st.mode = 'block'; st.close = '-->'; return { tokens: out, state: st }; }
          put('com', line.slice(i, end + 3)); i = end + 3; continue;
        }
        const m = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(line.slice(i));
        if (m) {
          put('op', '<');
          if (m[1]) put('op', '/');
          put('tag', m[2]);
          i += m[0].length;
          const name = m[2].toLowerCase();
          if (!m[1] && (name === 'script' || name === 'style')) st.pendingRaw = name === 'script' ? 'js' : 'css';
          let closed = false;
          while (i < line.length) {
            if (line.startsWith('/>', i)) { put('op', '/>'); i += 2; closed = true; break; }
            if (line[i] === '>') { put('op', '>'); i++; closed = true; break; }
            const ws = /^\s+/.exec(line.slice(i));
            if (ws) { put('plain', ws[0]); i += ws[0].length; continue; }
            const attr = /^[^\s=/>]+/.exec(line.slice(i));
            if (attr) {
              const a = attr[0];
              put(/^(?:data-|aria-|on)/.test(a) ? 'var' : 'attr', a);
              i += a.length;
              continue;
            }
            if (line[i] === '=') {
              put('op', '='); i++;
              const q = line[i];
              if (q === '"' || q === "'") {
                let j = line.indexOf(q, i + 1);
                if (j < 0) j = line.length - 1;
                put('str', line.slice(i, j + 1)); i = j + 1; continue;
              }
              const val = /^[^\s>]+/.exec(line.slice(i));
              if (val) { put('str', val[0]); i += val[0].length; continue; }
              continue;
            }
            put('plain', line[i]); i++;
          }
          if (closed && st.pendingRaw) {
            if (line.slice(i).trim() === '' && !/\/>$/.test(line)) { st.raw = st.pendingRaw; st.pendingRaw = null; }
            else st.pendingRaw = null;
          }
          continue;
        }
        if (/^<![^>]*>/.test(line.slice(i))) {
          const m2 = /^<![^>]*>/.exec(line.slice(i));
          put('com', m2[0]); i += m2[0].length; continue;
        }
        put('plain', ch); i++; continue;
      }
      if (ch === '&') {
        const m = /^&#?[\w]+;/.exec(line.slice(i));
        if (m) { put('var', m[0]); i += m[0].length; continue; }
      }
      let j = i;
      while (j < line.length && line[j] !== '<' && line[j] !== '&') j++;
      put('plain', line.slice(i, j));
      i = j;
    }
    return { tokens: out, state: st };
  }

  /* CSS: selectors, properties, values, at-rules. */
  function scanCss(line, st) {
    const out = [];
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    let i = 0;
    let inValue = !!st.inValue;
    while (i < line.length) {
      if (st.mode === 'block') {
        const at = line.indexOf('*/', i);
        if (at < 0) { put('com', line.slice(i)); return { tokens: out, state: st }; }
        put('com', line.slice(i, at + 2)); i = at + 2; st.mode = null; continue;
      }
      const ch = line[i];
      if (line.startsWith('/*', i)) {
        const at = line.indexOf('*/', i + 2);
        if (at < 0) { put('com', line.slice(i)); st.mode = 'block'; return { tokens: out, state: st }; }
        put('com', line.slice(i, at + 2)); i = at + 2; continue;
      }
      if (/\s/.test(ch)) { let j = i; while (j < line.length && /\s/.test(line[j])) j++; put('plain', line.slice(i, j)); i = j; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < line.length) { if (line[j] === '\\') { j += 2; continue; } if (line[j] === ch) { j++; break; } j++; }
        put('str', line.slice(i, j)); i = j; continue;
      }
      if (ch === '@') { const m = /^@[\w-]+/.exec(line.slice(i)); put('kw', m[0]); i += m[0].length; continue; }
      if (ch === '#') {
        const m = /^#[0-9a-fA-F]{3,8}\b/.exec(line.slice(i));
        if (m) { put('num', m[0]); i += m[0].length; continue; }
      }
      if (ch === '{') { put('op', ch); i++; inValue = false; st.inValue = false; continue; }
      if (ch === '}') { put('op', ch); i++; inValue = false; st.inValue = false; continue; }
      if (ch === ':') { put('op', ch); i++; inValue = true; st.inValue = true; continue; }
      if (ch === ';') { put('op', ch); i++; inValue = false; st.inValue = false; continue; }
      if (/[0-9]/.test(ch) || ((ch === '-' || ch === '.') && /[0-9]/.test(line[i + 1] || ''))) {
        const m = /^-?(?:\d*\.)?\d+(?:%|[a-z]{2,4})?/.exec(line.slice(i));
        if (m) { put('num', m[0]); i += m[0].length; continue; }
      }
      if (!inValue) {
        const sel = /^[.#]?[A-Za-z_][\w-]*|^::?[a-z-]+|^\[[^\]]*\]/.exec(line.slice(i));
        if (sel) { put(sel[0][0] === '.' || sel[0][0] === '#' || sel[0][0] === ':' ? 'attr' : 'tag', sel[0]); i += sel[0].length; continue; }
      } else {
        const prop = /^-{0,2}[A-Za-z_][\w-]*(?=\s*:)/.exec(line.slice(i));
        if (prop) { put('attr', prop[0]); i += prop[0].length; continue; }
        const id = /^[A-Za-z_-][\w-]*/.exec(line.slice(i));
        if (id) { const w = id[0]; put(TY.css && TY.css[w] ? 'fn' : 'plain', w); i += w.length; continue; }
      }
      put('op', ch); i++;
    }
    return { tokens: out, state: st };
  }

  /* Markdown: headings, fences (with their inner language), lists, quotes,
     inline code, links and emphasis. */
  function scanMd(line, st) {
    const out = [];
    const put = (t, v) => { if (v) out.push({ t: t, v: v }); };
    if (st.fence) {
      if (/^\s*```/.test(line)) { put('com', line); st.fence = null; return { tokens: out, state: st }; }
      const inner = st.fence;
      if (inner && SYNTAX[inner]) {
        const res = inner === 'html' ? scanHtml(line, st.innerState || (st.innerState = BLANK_STATE()), 'html')
          : scanCode(line, st.innerState || (st.innerState = BLANK_STATE()), inner);
        st.innerState = res.state;
        res.tokens.forEach((t) => out.push(t));
      } else put('plain', line);
      return { tokens: out, state: st };
    }
    const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence) {
      put('com', line);
      st.fence = fence[2] || 'text';
      st.innerState = null;
      return { tokens: out, state: st };
    }
    if (/^\s*#{1,6}\s/.test(line)) { put('kw', line); return { tokens: out, state: st }; }
    if (/^\s*>/.test(line)) { put('com', line); return { tokens: out, state: st }; }
    const bullet = /^(\s*)([-*+]|\d+\.)(\s+)/.exec(line);
    let i = 0;
    if (bullet) { put('plain', bullet[1]); put('attr', bullet[2]); put('plain', bullet[3]); i = bullet[0].length; }
    while (i < line.length) {
      if (line.startsWith('`', i)) {
        const at = line.indexOf('`', i + 1);
        if (at > 0) { put('str', line.slice(i, at + 1)); i = at + 1; continue; }
      }
      const bold = /^(\*\*|__)(.+?)\1/.exec(line.slice(i));
      if (bold) { put('kw', bold[0]); i += bold[0].length; continue; }
      const link = /^\[([^\]]*)\]\(([^)]*)\)/.exec(line.slice(i));
      if (link) {
        put('attr', link[1]);
        put('plain', '](');
        put('fn', link[2]);
        put('plain', ')');
        i += link[0].length;
        continue;
      }
      const m = /^[^`*_[$]+/.exec(line.slice(i));
      if (m) { put('plain', m[0]); i += m[0].length; continue; }
      put('plain', line[i]); i++;
    }
    return { tokens: out, state: st };
  }

  function lexLine(line, lang, st) {
    switch (FAMILY[lang] || 'text') {
      case 'json': return scanJson(line, st);
      case 'yaml': return scanYaml(line, st);
      case 'props': return scanProps(line, st);
      case 'html': return scanHtml(line, st, lang);
      case 'css': return scanCss(line, st);
      case 'md': return scanMd(line, st);
      case 'clike': case 'python': case 'shell': case 'sql': return scanCode(line, st, lang);
      default: return { tokens: [{ t: 'plain', v: line }], state: st };
    }
  }

  function tokensToHtml(tokens) {
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      out += t.t === 'plain' ? esc(t.v) : span(t.t, t.v);
    }
    return out || '';
  }

  function cloneState(st) {
    return {
      mode: st.mode, close: st.close, tag: st.tag, raw: st.raw,
      fence: st.fence, inValue: st.inValue,
      rawState: st.rawState ? Object.assign({}, st.rawState) : null,
      innerState: st.innerState ? Object.assign({}, st.innerState) : null
    };
  }

  function highlight(source, lang) {
    const lines = String(source == null ? '' : source).split('\n');
    const state = BLANK_STATE();
    let html = '';
    for (let i = 0; i < lines.length; i++) {
      const res = lexLine(lines[i], lang, state);
      html += tokensToHtml(res.tokens) + (i < lines.length - 1 ? '\n' : '');
    }
    return html;
  }

  /* ─────────────────────────────── folding ──────────────────────────────── */

  const PY_BLOCK = /^\s*(?:async\s+def|def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b[^#]*:\s*(?:#.*)?$/;
  const SH_OPEN = /^\s*(?:if\b.*|for\b.*|while\b.*|case\b.*|.*\bthen\s*|.*\bdo\s*|\{\s*)\s*$/;
  const SH_CLOSE = /^\s*(?:fi|done|esac|\})\s*$/;

  function indentOf(line) {
    const m = /^[ \t]*/.exec(line)[0];
    return m.replace(/\t/g, '  ').length;
  }

  function braceFolds(lang, lines) {
    const st = BLANK_STATE();
    const stack = [];
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const res = lexLine(lines[i], lang, st);
      for (const t of res.tokens) {
        if (t.t === 'str' || t.t === 'com' || t.t === 'plain') continue;
        if (t.t === 'op' && (t.v === '{' || t.v === '[' || t.v === '(')) stack.push({ ch: t.v, line: i });
        else if (t.t === 'op' && (t.v === '}' || t.v === ']' || t.v === ')')) {
          const open = stack.pop();
          const want = { '}': '{', ']': '[', ')': '(' }[t.v];
          if (open && open.ch !== want) { stack.length = 0; continue; }
          if (open && i > open.line + 1) out.push({ start: open.line + 1, end: i + 1, kind: 'block' });
        }
      }
    }
    return out;
  }

  function indentFolds(lines, opener, closer) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!opener.test(lines[i])) continue;
      const base = indentOf(lines[i]);
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (indentOf(lines[j]) <= base) break;
        end = j;
      }
      if (closer && end > i) {
        for (let j = end + 1; j < Math.min(lines.length, end + 3); j++) {
          if (closer.test(lines[j])) { end = j; break; }
          if (lines[j].trim()) break;
        }
      }
      if (end > i + 1) out.push({ start: i + 1, end: end + 1, kind: 'indent' });
    }
    return out;
  }

  function htmlFolds(lines) {
    const out = [];
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
      let m;
      while ((m = re.exec(lines[i])) !== null) {
        const name = m[2].toLowerCase();
        if (m[1]) {
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k].name === name) {
              const open = stack[k];
              stack.length = k;
              if (i > open.line + 1 && !VOID_TAGS[name]) out.push({ start: open.line + 1, end: i + 1, kind: 'tag' });
              break;
            }
          }
        } else if (!m[4] && !VOID_TAGS[name] && name !== 'br') {
          stack.push({ name: name, line: i });
        }
      }
    }
    return out;
  }

  function mdFolds(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const h = /^(#{1,6})\s/.exec(lines[i]);
      if (h) {
        const level = h[1].length;
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          const n = /^(#{1,6})\s/.exec(lines[j]);
          if (n && n[1].length <= level) break;
          if (lines[j].trim()) end = j;
        }
        if (end > i) out.push({ start: i + 1, end: end + 1, kind: 'heading' });
        continue;
      }
      if (/^\s*```/.test(lines[i])) {
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*```/.test(lines[j])) {
            if (j > i + 1) out.push({ start: i + 1, end: j + 1, kind: 'fence' });
            i = j;
            break;
          }
        }
      }
    }
    return out;
  }

  function foldRanges(lang, lines) {
    const fam = FAMILY[lang] || 'text';
    if (fam === 'text' || fam === 'md') return fam === 'md' ? mdFolds(lines) : [];
    if (fam === 'html') return htmlFolds(lines);
    if (fam === 'python') return indentFolds(lines, PY_BLOCK);
    if (fam === 'yaml') return indentFolds(lines, /^\s*[^\s#][^:]*:\s*$/);
    if (fam === 'props') {
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*\[[^\]]+\]/.test(lines[i])) continue;
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*\[[^\]]+\]/.test(lines[j])) break;
          if (lines[j].trim()) end = j;
        }
        if (end > i + 1) out.push({ start: i + 1, end: end + 1, kind: 'section' });
      }
      return out;
    }
    if (fam === 'shell') {
      return braceFolds(lang, lines).concat(indentFolds(lines, SH_OPEN, SH_CLOSE));
    }
    return braceFolds(lang, lines);
  }

  /* ───────────────────────────── brackets ──────────────────────────────── */

  const OPEN = { '(': ')', '[': ']', '{': '}' };
  const CLOSE = { ')': '(', ']': '[', '}': '{' };

  /* A copy of the text where strings and comments are blanked out, so a brace
     inside a string is never mistaken for a real one. */
  function maskedText(lang, lines) {
    const st = BLANK_STATE();
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const res = lexLine(lines[i], lang, st);
      const buf = new Array(lines[i].length).fill(' ');
      let at = 0;
      for (const t of res.tokens) {
        if (t.t !== 'str' && t.t !== 'com') {
          for (let k = 0; k < t.v.length; k++) buf[at + k] = t.v[k];
        }
        at += t.v.length;
      }
      out.push(buf.join(''));
    }
    return out;
  }

  function matchBracket(masked, lineIdx, col, ch) {
    const lines = masked;
    let line = lineIdx;
    let i = col;
    const open = OPEN[ch];
    const close = CLOSE[ch];
    if (open) {
      let depth = 0;
      for (; line < lines.length; line++) {
        const text = lines[line];
        for (; i < text.length; i++) {
          const c = text[i];
          if (c === ch) depth++;
          else if (c === open) { depth--; if (depth === 0) return { line: line, col: i }; }
        }
        i = 0;
      }
      return null;
    }
    if (close) {
      let depth = 0;
      for (; line >= 0; line--) {
        const text = lines[line];
        if (i >= text.length) i = text.length - 1;
        for (; i >= 0; i--) {
          const c = text[i];
          if (c === ch) depth++;
          else if (c === close) { depth--; if (depth === 0) return { line: line, col: i }; }
        }
        i = (lines[line - 1] || '').length - 1;
      }
    }
    return null;
  }

  /* ──────────────────────────── diagnostics ────────────────────────────── */

  /* Real parsers where the browser has one (JSON, JavaScript). Everything else
     is measured with the lexer (unbalanced brackets, unterminated strings and
     comments, indentation mistakes) and is labelled as a structural scan. */
  /* JSON parse errors carry a position in browsers but not always in other
     engines, so the locator finds the first structural mistake itself. */
  function jsonErrorPos(src) {
    let i = 0;
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const str = () => {
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '"') { i++; return true; }
        if (src[i] === '\n') return false;
        i++;
      }
      return false;
    };
    const value = () => {
      ws();
      const c = src[i];
      if (c === '{') {
        i++; ws();
        if (src[i] === '}') { i++; return true; }
        for (;;) {
          ws();
          if (src[i] !== '"') return false;
          if (!str()) return false;
          ws();
          if (src[i] !== ':') return false;
          i++;
          if (!value()) return false;
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === '}') { i++; return true; }
          return false;
        }
      }
      if (c === '[') {
        i++; ws();
        if (src[i] === ']') { i++; return true; }
        for (;;) {
          if (!value()) return false;
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === ']') { i++; return true; }
          return false;
        }
      }
      if (c === '"') return str();
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (m) { i += m[0].length; return true; }
      for (const lit of ['true', 'false', 'null']) if (src.startsWith(lit, i)) { i += lit.length; return true; }
      return false;
    };
    const ok = value();
    ws();
    return ok && i >= src.length ? -1 : Math.min(i, Math.max(0, src.length - 1));
  }

  function diagnose(text, lang) {
    const src = String(text == null ? '' : text);
    const lines = src.split('\n');
    const items = [];
    let engine = 'structural scan (lexer)';

    if (lang === 'json') {
      engine = 'JSON.parse';
      if (src.trim()) {
        try { JSON.parse(src); } catch (e) {
          const found = /position (\d+)/i.exec(e.message || '');
          let at = found ? parseInt(found[1], 10) : jsonErrorPos(src);
          if (!(at >= 0)) at = 0;
          const before = src.slice(0, at);
          items.push({
            line: before.split('\n').length,
            col: at - before.lastIndexOf('\n'),
            message: 'JSON: ' + String(e.message || 'invalid').replace(/^JSON\.parse: /, '').slice(0, 160),
            severity: 'error'
          });
        }
      }
      return { engine: engine, items: items };
    }

    if (lang === 'js' && src.trim()) {
      engine = 'JavaScript parser (browser)';
      const moduleSyntax = /(^|\n)\s*(?:import|export)\s/.test(src);
      if (!moduleSyntax) {
        try {
          // eslint-disable-next-line no-new-func
          new Function(src);
        } catch (e) {
          const m = /line (\d+)/i.exec(e.message || '');
          items.push({
            line: m ? parseInt(m[1], 10) : 1,
            col: 1,
            message: 'JavaScript: ' + String(e.message || 'syntax error'),
            severity: 'error'
          });
        }
      } else {
        engine = 'structural scan (ES module syntax — no bundler in the browser)';
      }
    }

    if (lang === 'html' || lang === 'xml') {
      engine = 'tag balance scan (not a validator)';
      /* A tag may wrap across lines and an attribute value may contain ">", so
         the whole document is scanned rather than one line at a time. The old
         per-line scan never saw a multi-line tag, and reported a perfectly
         valid AndroidManifest as elements closing the wrong parent. */
      const stack = [];
      const at = (idx) => {
        const before = src.slice(0, idx).split('\n');
        return { line: before.length, col: before[before.length - 1].length + 1 };
      };
      const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/([A-Za-z][\w:.-]*)\s*>|<([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        if (m[1]) {
          const name = m[1].toLowerCase();
          const pos = at(m.index);
          const open = stack[stack.length - 1];
          if (!open) {
            items.push({ line: pos.line, col: pos.col, message: '</' + name + '> has no opening tag', severity: 'error' });
          } else if (open.name !== name) {
            items.push({ line: pos.line, col: pos.col, message: '</' + name + '> closes <' + open.name + '> opened on line ' + open.line, severity: 'error' });
            stack.pop();
          } else stack.pop();
        } else if (m[2]) {
          const name = m[2].toLowerCase();
          if (!m[4] && !VOID_TAGS[name]) {
            const pos = at(m.index);
            stack.push({ name: name, line: pos.line });
          }
        }
      }
      stack.forEach((s) => items.push({ line: s.line, col: 1, message: '<' + s.name + '> is never closed', severity: 'error' }));
    }

    /* Lexer-level checks run for every language: they catch the mistakes that
       actually break a file and report the line where the token started. */
    const st = { mode: null, close: null };
    const stack = [];
    let openStr = null;
    let openCom = null;
    for (let i = 0; i < lines.length; i++) {
      const res = lexLine(lines[i], lang, st);
      if (st.badString) {
        items.push({ line: i + 1, col: st.badString.col, message: 'unterminated string', severity: 'error' });
        delete st.badString;
      }
      let at = 0;
      for (const t of res.tokens) {
        if (t.t === 'op') {
          for (let k = 0; k < t.v.length; k++) {
            const c = t.v[k];
            if (OPEN[c]) stack.push({ ch: c, line: i + 1, col: at + k + 1 });
            else if (CLOSE[c]) {
              const last = stack.pop();
              if (!last) items.push({ line: i + 1, col: at + k + 1, message: 'unexpected "' + c + '"', severity: 'error' });
              else if (last.ch !== CLOSE[c]) items.push({ line: i + 1, col: at + k + 1, message: '"' + c + '" closes "' + last.ch + '" opened on line ' + last.line, severity: 'error' });
            }
          }
        }
        at += t.v.length;
      }
      if (st.mode === 'str' && !openStr) openStr = { line: i + 1, close: st.close };
      if (st.mode === 'block' && !openCom) openCom = { line: i + 1, close: st.close };
      if (st.mode !== 'str') openStr = null;
      if (st.mode !== 'block') openCom = null;
    }
    stack.slice(-20).forEach((s) => items.push({ line: s.line, col: s.col, message: '"' + s.ch + '" is never closed', severity: 'error' }));
    if (openStr) items.push({ line: openStr.line, col: 1, message: 'unterminated string', severity: 'error' });
    if (openCom) items.push({ line: openCom.line, col: 1, message: 'unterminated comment', severity: 'error' });

    if (lang === 'python') {
      let seenCode = false;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (!ln.trim() || /^\s*#/.test(ln)) continue;
        if (/\t/.test(ln) && /^ +\S/.test(ln)) {
          items.push({ line: i + 1, col: 1, message: 'mixes tabs and spaces in indentation', severity: 'error' });
        }
        if (!seenCode) seenCode = true;
        else if (/^\s{1,3}\S/.test(ln) && /:\s*$/.test(lines[i - 1] || '') === false) {
          // falls inside a block most of the time; only flag obvious oddities
        }
      }
    }

    return { engine: engine, items: items.slice(0, 200) };
  }

  /* ─────────────────────────────── editor ──────────────────────────────── */

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  const LARGE_CHARS = 220000;
  const FOLD_LIMIT_LINES = 40000;

  function diffText(a, b) {
    let p = 0;
    const max = Math.min(a.length, b.length);
    while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return { p: p, s: s };
  }

  class Editor {
    constructor(opts) {
      this.gutter = opts.gutter;
      this.foldGutter = opts.foldGutter || null;
      this.pre = opts.pre;
      this.hl = opts.hl;
      this.code = opts.code;
      this.wrapEl = opts.wrapEl;
      this.onChange = opts.onChange || function () {};
      this.onCursor = opts.onCursor || function () {};
      this.onStatus = opts.onStatus || function () {};
      this.lang = 'text';
      this.path = '';
      this.tabSize = 2;
      this.model = '';
      this.view = '';
      this.viewMap = null;
      this.reverseMap = null;
      this.markers = [];
      this.foldList = [];
      this.active = {};
      this.lines = [''];
      this.lineStarts = [0];
      this.lineHtml = [];
      this.lineState = [];
      this.large = false;
      this.match = null;
      this.searchHits = [];
      this._mask = null;
      this._bind();
    }

    _bind() {
      const ta = this.code;
      ta.addEventListener('input', () => this._onInput());
      ta.addEventListener('scroll', () => this._scroll());
      ta.addEventListener('keydown', (e) => this._key(e));
      ['click', 'keyup', 'blur'].forEach((ev) => ta.addEventListener(ev, () => this._cursor()));
      ta.addEventListener('select', () => this._cursor());
      if (this.foldGutter) {
        this.foldGutter.addEventListener('click', (e) => {
          const b = e.target.closest('[data-fold]');
          if (!b) return;
          this.toggleFold(parseInt(b.getAttribute('data-fold'), 10), b.getAttribute('data-act') === 'open');
        });
      }
      this._split();
      this._renderAll();
      this._status();
    }

    /* ── geometry / options ── */

    lineHeight() {
      if (this._lh) return this._lh;
      let lh = 0;
      try { lh = parseFloat(getComputedStyle(this.code).lineHeight) || 0; } catch (e) { lh = 0; }
      if (!lh || isNaN(lh)) lh = (parseFloat(this.code.style.fontSize) || 13) * 1.55;
      this._lh = lh;
      return lh;
    }

    setOptions(o) {
      if (o.tabSize) this.tabSize = o.tabSize;
      if (o.fontSize) {
        this.code.style.fontSize = o.fontSize + 'px';
        this.pre.style.fontSize = o.fontSize + 'px';
        this.gutter.style.fontSize = Math.max(10, o.fontSize - 1) + 'px';
        this._lh = 0;
      }
      if (typeof o.wrap === 'boolean') {
        this.code.classList.toggle('wrap', o.wrap);
        this.pre.classList.toggle('wrap', o.wrap);
        this.code.setAttribute('wrap', o.wrap ? 'soft' : 'off');
      }
      this.gutter.style.lineHeight = this.lineHeight() + 'px';
      this._renderAll();
    }

    setLang(path, override) {
      this.path = path || '';
      const detected = langOf(path);
      this.lang = override && override !== 'auto' ? override : detected;
      this.detected = detected;
      this._lineCacheClear(0);
      this._renderAll();
      this._status();
    }

    setValue(text) {
      this.model = text == null ? '' : String(text);
      this.active = {};
      this.foldList = foldRanges(this.lang, this._split());
      this._view();
      this.code.value = this.view;
      this._lineCacheClear(0);
      this._renderAll();
      this.match = null;
      this._status();
    }

    getValue() { return this.model; }

    focus() { this.code.focus(); }

    getSelectionText() {
      const ta = this.code;
      return ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }

    _split() {
      this.lines = this.model.split('\n');
      this.lineStarts = [0];
      for (let i = 1; i < this.lines.length; i++) this.lineStarts[i] = this.lineStarts[i - 1] + this.lines[i - 1].length + 1;
      this.large = this.model.length > LARGE_CHARS || this.lines.length > FOLD_LIMIT_LINES;
      return this.lines;
    }

    _lineCacheClear(from) {
      if (from <= 0) { this.lineHtml = []; this.lineState = []; this._mask = null; return; }
      this.lineHtml.length = Math.min(this.lineHtml.length, from);
      this.lineState.length = Math.min(this.lineState.length, from);
      this._mask = null;
    }

    /* ── fold view ── */

    foldKey(range) { return range.start; }

    _view() {
      const lines = this.lines;
      this.markers = [];
      const folds = this.foldList.filter((f) => this.active[f.start] && f.end > f.start && f.end <= lines.length);
      if (!folds.length) {
        this.view = this.model;
        this.viewMap = null;
        this.reverseMap = null;
        this.markers = [];
        return;
      }
      const byStart = {};
      folds.forEach((f) => { byStart[f.start] = f; });
      const map = [];
      const rev = [];
      let out = '';
      let line = 0;
      const pushText = (text, modelAt) => {
        for (let k = 0; k < text.length; k++) map.push(modelAt + k);
        out += text;
      };
      while (line < lines.length) {
        const f = byStart[line + 1];
        if (f) {
          const first = lines[line].replace(/[ \t]+$/, '');
          const foldStart = this.lineStarts[line];
          pushText(first, foldStart);
          const endLine = f.end - 1;
          const foldEnd = this.lineStarts[endLine] + lines[endLine].length;
          this.markers.push(out.length);
          map.push(foldEnd);
          out += '⋯';
          line = f.end;
        } else {
          pushText(lines[line], this.lineStarts[line]);
          line++;
        }
        if (line < lines.length) {
          map.push(this.lineStarts[line] ? this.lineStarts[line] - 1 : this.model.length);
          out += '\n';
        }
      }
      map.push(this.model.length);
      for (let i = 0; i < map.length; i++) if (rev[map[i]] === undefined) rev[map[i]] = i;
      this.view = out;
      this.viewMap = map;
      this.reverseMap = rev;
    }

    _modelAt(viewOff) {
      if (!this.viewMap) return viewOff;
      if (viewOff >= this.viewMap.length) return this.model.length;
      return this.viewMap[viewOff];
    }

    _viewAt(modelOff) {
      if (!this.viewMap) return modelOff;
      const v = this.reverseMap[modelOff];
      return v === undefined ? -1 : v;
    }

    toggleFold(startLine, open) {
      const range = this.foldList.find((f) => f.start === startLine);
      if (!range) return false;
      if (open || !this.active[startLine]) delete this.active[startLine];
      if (!open && this.foldList.some((f) => f.start === startLine)) this.active[startLine] = true;
      const caretModel = this._modelAt(this.code.selectionStart);
      this._view();
      this.code.value = this.view;
      this._renderAll();
      this._setCaretModel(caretModel);
      return true;
    }

    unfoldAll() {
      if (!Object.keys(this.active).length) return;
      const caretModel = this._modelAt(this.code.selectionStart);
      this.active = {};
      this._view();
      this.code.value = this.view;
      this._renderAll();
      this._setCaretModel(caretModel);
    }

    folds() { return this.foldList; }

    /* ── rendering ── */

    _visibleRange() {
      const lh = this.lineHeight();
      const top = this.code.scrollTop || 0;
      const height = this.code.clientHeight || 0;
      if (!height) return { from: 0, to: Math.min(this.lines.length, 400) };
      const from = Math.max(0, Math.floor(top / lh) - 40);
      const to = Math.min(this.lines.length, Math.ceil((top + height) / lh) + 40);
      return { from: from, to: Math.max(to, from + 1) };
    }

    /* Lexes forward from the last cached line, so typing re-lexes from the
       edited line only. HTML is only built for the lines being shown. */
    _ensureStates(upto, htmlTo) {
      if (!this.lineState.length) this.lineState[0] = cloneState(BLANK_STATE());
      let i = this.lineState.length - 1;
      while (i < upto) {
        const st = i === 0 ? cloneState(BLANK_STATE()) : cloneState(this.lineState[i]);
        const res = lexLine(this.lines[i], this.lang, st);
        if (i < htmlTo) this.lineHtml[i] = tokensToHtml(res.tokens);
        this.lineState[i + 1] = cloneState(st);
        i++;
      }
    }

    _renderAll() {
      const n = this.lines.length;
      const win = this.large ? this._visibleRange() : { from: 0, to: n };
      this._ensureStates(this.large ? Math.min(n, win.to + 1) : n, win.to);
      let html = '';
      for (let i = 0; i < n; i++) {
        if (i >= win.from && i < win.to) html += this.lineHtml[i] || '';
        else html += esc(this.lines[i]);
        if (i < n - 1) html += '\n';
      }
      if (this.match) html = this._markBrackets(html);
      this.hl.innerHTML = html + '\n';
      this._renderGutter();
      this._scroll();
    }

    _markBrackets(html) {
      // Re-render the two bracket lines with a highlight span; simplest and
      // safest is to wrap the characters in the already highlighted lines.
      const a = this.match.a;
      const b = this.match.b;
      if (!a || !b) return html;
      const lines = html.split('\n');
      const wrap = (lineIdx, col) => {
        const text = lines[lineIdx];
        if (text === undefined) return;
        let plainAt = -1;
        let seen = 0;
        // Walk the rendered HTML and count text characters (tags excluded).
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '<') { i = text.indexOf('>', i); if (i < 0) break; continue; }
          if (text[i] === '&') { i = text.indexOf(';', i); if (i < 0) break; }
          if (seen === col) { plainAt = i; break; }
          seen++;
        }
        if (plainAt < 0) return;
        const ch = text[plainAt];
        const end = ch === '&' ? text.indexOf(';', plainAt) + 1 : plainAt + 1;
        lines[lineIdx] = text.slice(0, plainAt) + '<span class="brk">' + text.slice(plainAt, end) + '</span>' + text.slice(end);
      };
      wrap(a.line, a.col);
      if (b.line !== a.line || b.col !== a.col) wrap(b.line, b.col);
      return lines.join('\n');
    }

    _renderGutter() {
      const n = this.lines.length;
      if (this.large) {
        const win = this._visibleRange();
        let html = '';
        for (let i = win.from; i < win.to; i++) html += (i + 1) + '\n';
        this.gutter.innerHTML = new Array(win.from + 1).join('\n') + html;
      } else {
        let nums = '';
        for (let i = 1; i <= n; i++) nums += i + '\n';
        this.gutter.textContent = nums;
      }
      if (!this.foldGutter) return;
      const lh = this.lineHeight();
      if (!this.foldList.length) {
        this.foldGutter.innerHTML = '';
        this.foldGutter.style.minHeight = '';
        return;
      }
      const marks = this.foldList.map((f) => {
        const collapsed = !!this.active[f.start];
        const top = (f.start - 1) * lh;
        return '<button class="fold' + (collapsed ? ' closed' : '') + '" data-fold="' + f.start + '" data-act="' +
          (collapsed ? 'open' : 'close') + '" style="top:' + top + 'px" title="' +
          (collapsed ? 'Expand' : 'Fold') + ' lines ' + f.start + '-' + f.end + '">' + (collapsed ? '▶' : '▾') + '</button>';
      }).join('');
      this.foldGutter.innerHTML = '<div class="fold-inner" style="height:' + (n * lh) + 'px">' + marks + '</div>';
    }

    _scroll() {
      // The textarea is the scroller (its own scrollTop), so the highlight layer
      // is translated to match instead of relying on a second scroll box.
      if (this.hl && this.hl.style) {
        this.hl.style.transform = 'translate(' + (-(this.code.scrollLeft || 0)) + 'px,' +
          (-(this.code.scrollTop || 0)) + 'px)';
      }
      this.gutter.scrollTop = this.code.scrollTop;
      if (this.foldGutter) this.foldGutter.scrollTop = this.code.scrollTop;
      if (this.large) {
        const win = this._visibleRange();
        if (win.from !== this._lastWin) {
          this._lastWin = win.from;
          this._renderAll();
        }
      }
    }

    /* ── edits ── */

    _onInput() {
      const nv = this.code.value;
      let caretModel;
      let m0 = 0;
      let m1 = 0;
      if (this.viewMap) {
        const d = diffText(this.view, nv);
        const removedEnd = this.view.length - d.s;
        const touchesMarker = this.markers.some((m) => m >= d.p && m < removedEnd);
        if (touchesMarker) {
          // A keystroke that would eat a folded marker only expands the fold; it
          // never edits text the user cannot see.
          const caret = this._modelAt(Math.min(this.code.selectionStart, this.viewMap.length - 1));
          this.active = {};
          this._view();
          this.code.value = this.view;
          this._renderAll();
          this._setCaretModel(caret);
          this._status();
          return;
        }
        m0 = this._modelAt(d.p);
        m1 = removedEnd >= this.view.length ? this.model.length : this._modelAt(removedEnd);
        const inserted = nv.slice(d.p, nv.length - d.s);
        this.model = this.model.slice(0, m0) + inserted + this.model.slice(m1);
        caretModel = m0 + inserted.length;
      } else {
        this.model = nv;
        caretModel = this.code.selectionStart;
        m0 = m1 = caretModel;
      }
      this._afterEdit(caretModel, m0, m1);
    }

    /* An edit invalidates every fold it touched; folds above survive. */
    _dropFolds(m0, m1) {
      if (!this.foldList.length) return;
      const fromLine = this._lineOf(Math.min(m0, this.model.length)) + 1;
      const toLine = this._lineOf(Math.min(m1, this.model.length)) + 1;
      const before = this.foldList.length;
      this.foldList = this.foldList.filter((f) => !(f.start <= toLine && f.end >= fromLine));
      if (this.foldList.length === before) return;
      Object.keys(this.active).forEach((k) => { delete this.active[k]; });
      this._view();
    }

    _afterEdit(caretModel, m0, m1) {
      this._split();
      this._lineCacheClear(this._lineOf(Math.min(caretModel, this.model.length)));
      if (m0 !== undefined) this._dropFolds(m0, m1);
      this.foldList = this.large ? [] : foldRanges(this.lang, this.lines);
      if (!this.foldList.length) this.active = {};
      this._view();
      if (this.code.value !== this.view) this.code.value = this.view;
      this._setCaretModel(caretModel);
      this._renderAll();
      this._cursor();
      this.onChange(this.model);
      this._status();
    }

    _lineOf(off) {
      let lo = 0, hi = this.lines.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    _setCaretModel(modelOff) {
      const v = this._viewAt(modelOff);
      const at = v < 0 ? this.code.value.length : v;
      this.code.setSelectionRange(Math.min(at, this.code.value.length), Math.min(at, this.code.value.length));
    }

    /* ── caret, brackets, status ── */

    _maskLines() {
      if (this._mask && this._maskLen === this.model.length) return this._mask;
      this._mask = maskedText(this.lang, this.lines);
      this._maskLen = this.model.length;
      return this._mask;
    }

    _cursor() {
      const ta = this.code;
      const viewPos = ta.selectionStart;
      const modelPos = this._modelAt(viewPos);
      const endModel = this._modelAt(ta.selectionEnd);
      const idx = this._lineOf(modelPos);
      const line = idx + 1;
      const col = modelPos - this.lineStarts[idx] + 1;
      this.caret = { line: line, col: col, offset: modelPos, end: endModel };
      this._matchBracketAt(line, col);
      this.onCursor(line, col, { selected: Math.abs(endModel - modelPos) });
      this._status();
    }

    _matchBracketAt(line, col) {
      const idx = line - 1;
      const text = this.lines[idx] || '';
      let colIdx = col - 1;
      let ch = text[colIdx];
      if (!OPEN[ch] && !CLOSE[ch]) { ch = text[colIdx - 1]; colIdx -= 1; }
      if (!OPEN[ch] && !CLOSE[ch]) { this.match = null; return; }
      if (this.large) { this.match = null; return; }
      const masked = this._maskLines();
      if (!masked[idx] || masked[idx][colIdx] !== ch) {
        if (this.match) { this.match = null; this._renderAll(); }
        return;
      }
      const hit = matchBracket(masked, idx, colIdx, ch);
      const prev = this.match;
      this.match = hit ? { a: { line: idx, col: colIdx }, b: hit } : null;
      const same = prev && this.match && prev.a.line === this.match.a.line && prev.a.col === this.match.a.col;
      if (!same) this._renderAll();
    }

    _status() {
      const caret = this.caret || { line: 1, col: 1, offset: 0, end: 0 };
      const eol = this.model.indexOf('\r\n') >= 0 ? 'CRLF' : 'LF';
      this.onStatus({
        lang: this.lang,
        langLabel: LANG_LABELS[this.lang] || 'Plain text',
        detected: this.detected || this.lang,
        line: caret.line,
        col: caret.col,
        sel: Math.abs(caret.end - caret.offset),
        lines: this.lines.length,
        chars: this.model.length,
        indent: 'Spaces: ' + this.tabSize,
        eol: eol,
        encoding: 'UTF-8',
        large: this.large,
        folds: this.foldList.length
      });
    }

    /* ── keyboard ── */

    _key(e) {
      const ta = this.code;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) this._outdent();
        else if (ta.selectionStart !== ta.selectionEnd) this._indentBlock();
        else this._insert(' '.repeat(this.tabSize));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this._newline();
        return;
      }
      if (e.key === 'Escape' && this.match) { this.match = null; this._renderAll(); return; }
      if (mod && e.key === '/') { e.preventDefault(); this.toggleComment(); return; }

      if (PAIRS[e.key] && !e.ctrlKey && !e.metaKey) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const close = PAIRS[e.key];
        if (start !== end && (e.key === '(' || e.key === '[' || e.key === '{' || e.key === '"' || e.key === "'" || e.key === '`')) {
          e.preventDefault();
          const sel = ta.value.slice(start, end);
          ta.value = ta.value.slice(0, start) + e.key + sel + close + ta.value.slice(end);
          ta.setSelectionRange(start + 1, start + 1 + sel.length);
          this._onInput();
          return;
        }
        if (start === end) {
          const next = ta.value.slice(start, start + 1);
          if (close === e.key && next === e.key) {
            e.preventDefault();
            ta.setSelectionRange(start + 1, start + 1);
            this._cursor();
            return;
          }
          if (!next || /[\s)\]}>,;]/.test(next)) {
            if (this._insideStringOrComment()) return;
            e.preventDefault();
            this._insert(e.key + close, 1);
            return;
          }
        }
      }
      if (e.key === 'Backspace' && ta.selectionStart === ta.selectionEnd) {
        const start = ta.selectionStart;
        const pair = ta.value.slice(start - 1, start + 1);
        if (pair.length === 2 && PAIRS[pair[0]] === pair[1]) {
          e.preventDefault();
          ta.value = ta.value.slice(0, start - 1) + ta.value.slice(start + 1);
          ta.setSelectionRange(start - 1, start - 1);
          this._onInput();
        }
        return;
      }
      if ((e.key === ')' || e.key === ']' || e.key === '}') && ta.selectionStart === ta.selectionEnd) {
        // Step over a closer that is already there instead of doubling it.
        if (ta.value[ta.selectionStart] === e.key) {
          e.preventDefault();
          ta.setSelectionRange(ta.selectionStart + 1, ta.selectionStart + 1);
          this._cursor();
          return;
        }
      }
      if (e.key === '}' || e.key === ')' || e.key === ']') {
        // typing a closer on an over-indented line lines it up with its opener
        const start = ta.selectionStart;
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const before = ta.value.slice(lineStart, start);
        if (/^[ \t]+$/.test(before) && before.length >= this.tabSize) {
          e.preventDefault();
          ta.value = ta.value.slice(0, Math.max(lineStart, start - this.tabSize)) + e.key + ta.value.slice(start);
          ta.setSelectionRange(start - this.tabSize + 1, start - this.tabSize + 1);
          this._onInput();
          return;
        }
      }
      if (mod && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        this._outdent();
        return;
      }
    }

    _insideStringOrComment() {
      const pos = this._modelAt(this.code.selectionStart);
      const idx = this._lineOf(pos);
      const masked = this._maskLines();
      const text = this.lines[idx] || '';
      const col = pos - this.lineStarts[idx];
      // A caret inside a string means the mask has a blank there.
      return (masked[idx] || '')[col] === undefined ? false : (masked[idx] || '')[col] === ' ' && text[col] !== ' ';
    }

    _insert(text, caretBack) {
      const ta = this.code;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      const at = start + text.length - (caretBack || 0);
      ta.setSelectionRange(at, at);
      this._onInput();
    }

    _indentBlock() {
      const ta = this.code;
      let start = ta.selectionStart;
      let end = ta.selectionEnd;
      const firstStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      let lastEnd = ta.value.indexOf('\n', end);
      if (lastEnd < 0) lastEnd = ta.value.length;
      const block = ta.value.slice(firstStart, lastEnd);
      const pad = ' '.repeat(this.tabSize);
      const next = block.split('\n').map((l) => pad + l).join('\n');
      ta.value = ta.value.slice(0, firstStart) + next + ta.value.slice(lastEnd);
      ta.setSelectionRange(start + pad.length, end + pad.length * block.split('\n').length);
      this._onInput();
    }

    _outdent() {
      const ta = this.code;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const firstStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      let lastEnd = ta.value.indexOf('\n', end);
      if (lastEnd < 0) lastEnd = ta.value.length;
      const block = ta.value.slice(firstStart, lastEnd);
      let removed = 0;
      const next = block.split('\n').map((l) => {
        const m = /^ {1,4}|\t/.exec(l);
        if (!m) return l;
        removed += m[0].length;
        return l.slice(m[0].length);
      }).join('\n');
      if (!removed) return;
      ta.value = ta.value.slice(0, firstStart) + next + ta.value.slice(lastEnd);
      ta.setSelectionRange(Math.max(firstStart, start - this.tabSize), Math.max(firstStart, end - removed));
      this._onInput();
      void start;
    }

    /* Indentation follows the current language's own rules. */
    _newlineIndent(line) {
      const lang = this.lang;
      const fam = FAMILY[lang] || 'text';
      const unit = ' '.repeat(this.tabSize);
      const indent = (/^[ \t]*/.exec(line) || [''])[0];
      const body = line.replace(/\s+$/, '');
      let extra = '';
      let push = false;
      if (fam === 'python') push = /:\s*(#.*)?$/.test(body);
      else if (fam === 'yaml') push = /:\s*$/.test(body) || /^\s*-\s*$/.test(body);
      else if (fam === 'shell') push = /(?:then|do|else|\{)\s*$/.test(body);
      else if (fam === 'html') {
        const tag = /<([A-Za-z][\w:-]*)[^>]*?>\s*$/.exec(body);
        const isClose = /<\/[A-Za-z]/.test(body);
        push = !!tag && !/\/>\s*$/.test(body) && !isClose && !VOID_TAGS[tag[1].toLowerCase()];
      } else if (fam === 'props' || fam === 'md') push = false;
      else push = /[{\[(]\s*$/.test(body);
      if (push) extra = unit;
      return indent + extra;
    }

    /* A closer typed at the start of a line steps back one level. */
    _newline() {
      const ta = this.code;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      const line = ta.value.slice(lineStart, start);
      const next = ta.value.slice(start, start + 1);
      const indent = this._newlineIndent(line);
      const body = line.replace(/\s+$/, '');
      const opensPair = /[{\[(]$/.test(body) && /^[}\])]/.test(next);
      if (opensPair) {
        const inner = indent;
        const outer = indent.slice(0, Math.max(0, indent.length - this.tabSize));
        const text = '\n' + inner + '\n' + outer;
        ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
        const at = start + 1 + inner.length;
        ta.setSelectionRange(at, at);
        this._onInput();
        return;
      }
      const text = '\n' + indent;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      ta.setSelectionRange(start + text.length, start + text.length);
      this._onInput();
    }

    /* ── words, completion ── */

    wordAt() {
      const pos = this._modelAt(this.code.selectionStart);
      const value = this.model;
      let start = pos;
      while (start > 0 && /[A-Za-z0-9_$]/.test(value[start - 1])) start--;
      let end = pos;
      while (end < value.length && /[A-Za-z0-9_$]/.test(value[end])) end++;
      return { word: value.slice(start, end), start: start, end: end };
    }

    complete(extraWords) {
      const at = this.wordAt();
      const q = at.word.toLowerCase();
      const seen = {};
      const out = [];
      const push = (w, kind) => {
        if (!w || w.length < 2 || seen[w] || w === at.word) return;
        if (q && w.toLowerCase().indexOf(q) !== 0) return;
        seen[w] = 1;
        out.push({ text: w, kind: kind });
      };
      const kw = KEYWORDS[this.lang] || '';
      kw.split(' ').forEach((w) => push(w, 'keyword'));
      (TYPES[this.lang] || '').split(' ').forEach((w) => push(w, 'type'));
      const words = this.model.match(/[A-Za-z_$][\w$]{1,40}/g) || [];
      const counts = {};
      words.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
      Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 200).forEach((w) => push(w, 'word'));
      (extraWords || []).forEach((w) => push(w, 'symbol'));
      out.sort((a, b) => {
        if (a.kind !== b.kind) {
          const rank = { keyword: 0, type: 1, symbol: 2, word: 3 };
          return rank[a.kind] - rank[b.kind];
        }
        return a.text.localeCompare(b.text);
      });
      return { items: out.slice(0, 20), at: at };
    }

    insertCompletion(text) {
      const at = this.wordAt();
      this.model = this.model.slice(0, at.start) + text + this.model.slice(at.end);
      const caret = at.start + text.length;
      this._afterEdit(caret);
      this.focus();
    }

    /* ── format ── */

    format() {
      const src = this.model;
      if (!src.trim()) return false;
      let next = src;
      if (this.lang === 'json') {
        try { next = JSON.stringify(JSON.parse(src), null, this.tabSize) + '\n'; } catch (e) { next = src; }
      }
      if (next === src) {
        const unit = ' '.repeat(this.tabSize);
        let depth = 0;
        next = src.split('\n').map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          const closes = (trimmed.match(/^[}\])]/g) || []).length;
          const level = Math.max(0, depth - closes);
          depth = Math.max(0, depth + (trimmed.match(/[{([]/g) || []).length - (trimmed.match(/[})\]]/g) || []).length);
          return unit.repeat(level) + trimmed;
        }).join('\n');
      }
      if (next === src) return false;
      const caret = this._modelAt(this.code.selectionStart);
      this.model = next;
      this.active = {};
      this.foldList = foldRanges(this.lang, this._split());
      this._view();
      this.code.value = this.view;
      this._lineCacheClear(0);
      this._renderAll();
      this._setCaretModel(Math.min(caret, next.length));
      this.onChange(this.model);
      this._status();
      return true;
    }

    /* ── find / replace ── */

    _matcher(query, opts) {
      const o = opts || {};
      if (!query) return null;
      let source = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (o.wholeWord) source = '\\b(?:' + source + ')\\b';
      try {
        return new RegExp(source, 'g' + (o.caseSensitive ? '' : 'i'));
      } catch (e) {
        return null;
      }
    }

    searchAll(query, opts) {
      const re = this._matcher(query, opts);
      if (!re) return [];
      const hits = [];
      let m;
      const text = this.model;
      while ((m = re.exec(text)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length });
        if (m[0] === '') re.lastIndex++;
        if (hits.length > 5000) break;
      }
      this.searchHits = hits;
      return hits;
    }

    _reveal(modelOff) {
      if (!this.viewMap) return true;
      if (this._viewAt(modelOff) >= 0) return true;
      const line = this._lineOf(modelOff) + 1;
      let changed = false;
      Object.keys(this.active).forEach((k) => {
        const f = this.foldList.find((x) => x.start === parseInt(k, 10));
        if (f && line >= f.start && line <= f.end) { delete this.active[k]; changed = true; }
      });
      if (changed) {
        this._view();
        this.code.value = this.view;
        this._renderAll();
      }
      return this._viewAt(modelOff) >= 0;
    }

    _scrollToModel(modelOff) {
      const line = this._lineOf(modelOff);
      const lh = this.lineHeight();
      const ta = this.code;
      const top = line * lh;
      if (top < ta.scrollTop || top > ta.scrollTop + (ta.clientHeight || 0) - lh * 2) {
        ta.scrollTop = Math.max(0, top - lh * 3);
        this._scroll();
      }
    }

    find(query, opts) {
      const o = typeof opts === 'boolean' ? { backward: opts } : (opts || {});
      const hits = this.searchAll(query, o);
      if (!hits.length) return false;
      const caret = this._modelAt(this.code.selectionEnd);
      let hit;
      if (o.backward) {
        const sel = this._modelAt(this.code.selectionStart);
        hit = hits.slice().reverse().find((h) => h.start < sel) || hits[hits.length - 1];
      } else {
        hit = hits.find((h) => h.start >= caret) || hits[0];
      }
      if (!this._reveal(hit.start)) return false;
      const v0 = this._viewAt(hit.start);
      const v1 = this._viewAt(hit.end) >= 0 ? this._viewAt(hit.end) : v0 + (hit.end - hit.start);
      const ta = this.code;
      ta.focus();
      ta.setSelectionRange(v0, v1);
      this._scrollToModel(hit.start);
      this._cursor();
      this.findIndex = hits.indexOf(hit);
      return { count: hits.length, index: this.findIndex + 1 };
    }

    replaceOne(query, replacement, opts) {
      const o = opts || {};
      const hits = this.searchAll(query, o);
      if (!hits.length) return false;
      const selStart = this._modelAt(this.code.selectionStart);
      const selEnd = this._modelAt(this.code.selectionEnd);
      const hit = hits.find((h) => h.start === selStart && h.end === selEnd) || hits.find((h) => h.start >= selEnd) || hits[0];
      const text = typeof replacement === 'string' ? replacement.replace(/\$(\d)/g, '$$$1') : replacement;
      const piece = query && o.regex ? this.model.slice(hit.start, hit.end).replace(this._matcher(query, o), replacement) : text;
      this.model = this.model.slice(0, hit.start) + piece + this.model.slice(hit.end);
      this._afterEdit(hit.start + piece.length);
      this.find(query, Object.assign({}, o, { backward: false }));
      return true;
    }

    replaceAll(query, replacement, opts) {
      const o = opts || {};
      const hits = this.searchAll(query, o);
      if (!hits.length) return 0;
      const re = this._matcher(query, o);
      const text = o.regex && re ? this.model.replace(re, replacement) : this.model.split(query).join(replacement);
      const caret = this._modelAt(this.code.selectionStart);
      this.model = text;
      this._afterEdit(Math.min(caret, text.length));
      return hits.length;
    }

    /* ── navigation ── */

    gotoLine(line, col) {
      const target = Math.max(1, Math.min(this.lines.length, line | 0));
      let at = this.lineStarts[target - 1] + Math.max(0, (col || 1) - 1);
      at = Math.min(at, this.model.length);
      this._reveal(at);
      const ta = this.code;
      const v = this._viewAt(at);
      const pos = v < 0 ? ta.value.length : v;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      this._scrollToModel(at);
      this._cursor();
      this.match = null;
      return target;
    }

    toggleComment() {
      const fam = FAMILY[this.lang] || 'text';
      if (fam === 'html' || fam === 'md' || fam === 'json' || fam === 'text' || fam === 'css') return false;
      const marker = fam === 'python' || fam === 'shell' || fam === 'yaml' || fam === 'props' ? '#' : (fam === 'sql' ? '--' : '//');
      const ta = this.code;
      const selStart = this._lineOf(this._modelAt(ta.selectionStart));
      const selEnd = this._lineOf(this._modelAt(ta.selectionEnd));
      const lines = this.model.split('\n');
      const all = [];
      for (let i = selStart; i <= selEnd; i++) if (lines[i].trim()) all.push(lines[i]);
      if (!all.length) return false;
      const commented = all.every((l) => l.trim().indexOf(marker) === 0);
      for (let i = selStart; i <= selEnd; i++) {
        if (!lines[i].trim()) continue;
        if (commented) lines[i] = lines[i].replace(new RegExp('^(\\s*)' + marker.replace(/[-/]/g, '\\$&') + ' ?'), '$1');
        else lines[i] = lines[i].replace(/^(\s*)/, '$1' + marker + ' ');
      }
      const caret = this._modelAt(ta.selectionStart);
      this.model = lines.join('\n');
      this._afterEdit(Math.min(caret, this.model.length));
      return true;
    }
  }

  window.IdeEditor = {
    create: (o) => new Editor(o),
    highlight: highlight,
    langOf: langOf,
    langName: (path) => LANG_LABELS[langOf(path)] || 'Plain text',
    langLabel: langLabel,
    languages: Object.keys(LANG_LABELS).map((id) => ({ id: id, label: LANG_LABELS[id], exts: LANGS[id] || [] })),
    foldRanges: foldRanges,
    diagnose: diagnose,
    lexLine: lexLine,
    blankState: BLANK_STATE,
    family: (lang) => FAMILY[lang] || 'text'
  };
})();
