/* A small code editor: textarea for input, highlighted <pre> underneath,
   gutter for line numbers, find/replace, indentation and bracket pairs.
   No build step and no CDN, so it works offline and on a phone. */
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

  /* Plain names for the status bar, so the editor says what it is in. */
  const LANG_LABELS = {
    html: 'HTML', css: 'CSS', js: 'JavaScript', ts: 'TypeScript', json: 'JSON',
    xml: 'XML', yaml: 'YAML', java: 'Java', kotlin: 'Kotlin', gradle: 'Gradle',
    c: 'C', cpp: 'C++', rust: 'Rust', dart: 'Dart', csharp: 'C#', go: 'Go',
    swift: 'Swift', python: 'Python', php: 'PHP', shell: 'Shell', sql: 'SQL',
    md: 'Markdown', props: 'Properties', text: 'Plain text'
  };

  const COMMON = 'true false null';
  const KEYWORDS = {
    js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await interface type enum implements public private protected readonly as from get set ' + COMMON,
    ts: 'break case catch class const continue declare default delete do else export extends finally for function if implement implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies static super switch this throw try type typeof var void while with yield as async await enum abstract ' + COMMON,
    json: 'true false null',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits ' + COMMON,
    kotlin: 'abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package param private protected public reified return sealed set super suspend tailrec this throw try typealias val value var vararg when where while ' + COMMON,
    gradle: 'apply buildscript dependencies ext from id implementation plugins repositories task ' + COMMON,
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while ' + COMMON,
    cpp: 'alignas alignof asm auto bool break case catch char class const constexpr continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static static_cast struct switch template this throw try typedef typeid typename union unsigned using virtual void volatile while ' + COMMON,
    rust: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while ' + COMMON,
    dart: 'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for Function get hide if implements import in interface is late library mixin new on operator part required rethrow return set show static super switch sync this throw try typedef var void when while with yield ' + COMMON,
    csharp: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await record ' + COMMON,
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var ' + COMMON,
    swift: 'associatedtype break case catch class continue default defer deinit do else enum extension fallthrough for func guard if import in init inout internal let open operator override private protocol public repeat rethrows return self Self static struct subscript super switch throw throws try typealias var where while ' + COMMON,
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return True False try while with yield self print match case int str float list dict set tuple bool',
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield ' + COMMON,
    shell: 'alias break case cd continue do done elif else esac eval exec exit export fi for function if in local printf read return set shift source then until while echo sudo ' + COMMON,
    sql: 'add all alter and as asc between by case change column commit constraint create database default delete desc distinct drop else end exists from group having if in index inner insert into is join key left like limit not null on or order outer primary references right rollback select set table then union unique update values view when where with ' + COMMON,
    yaml: 'true false null yes no on off ',
    xml: 'xml version encoding standalone',
    css: 'important media supports keyframes font-face import charset page root',
    html: 'html head body div span script style link meta title class id href src',
    md: '',
    props: '',
    text: ''
  };

  function langOf(path) {
    const name = String(path || '').split('/').pop();
    const ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : name.toLowerCase();
    if (/^build\.gradle\.kts$|^settings\.gradle\.kts$/.test(name)) return 'kotlin';
    for (const key in LANGS) {
      if (LANGS[key].indexOf(ext) >= 0) return key;
    }
    return 'text';
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function span(cls, text) {
    return '<span class="' + cls + '">' + esc(text) + '</span>';
  }

  function markWords(src, lang) {
    const words = (KEYWORDS[lang] || '').split(' ');
    if (!words.length) return esc(src);
    const set = {};
    words.forEach((w) => { if (w) set[w] = 1; });
    return src.split(/([A-Za-z_$][\w$]*)/).map((word) => {
      if (set[word]) return span('tok-key', word);
      if (/^\d+(\.\d+)?$/.test(word)) return span('tok-num', word);
      return esc(word);
    }).join('');
  }

  /* One pass so a string inside a comment (or the reverse) cannot double-count. */
  function tokenize(src, re, classify) {
    let out = '';
    let last = 0;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) out += classify.plain(src.slice(last, m.index));
      out += classify.token(m[0]);
      last = m.index + m[0].length;
      if (m[0] === '') re.lastIndex += 1;
    }
    return out + classify.plain(src.slice(last));
  }

  function highlightHTML(src) {
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?[A-Za-z][\w:-]*|>|"[^"]*"|'[^']*'/g;
    return tokenize(src, re, {
      plain: (t) => esc(t),
      token: (t) => {
        if (t.startsWith('<!--') || t.startsWith('<!')) return span('tok-com', t);
        if (t === '>') return span('tok-tag', t);
        if (t[0] === '"' || t[0] === "'") return span('tok-str', t);
        return span('tok-tag', t);
      }
    });
  }

  function highlightCSS(src) {
    const re = /\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|#[0-9a-fA-F]{3,8}\b|@[a-zA-Z-]+|[.#]?[A-Za-z-][\w-]*(?=\s*:)|-?\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg)?\b/g;
    return tokenize(src, re, {
      plain: (t) => esc(t),
      token: (t) => {
        if (t.startsWith('/*')) return span('tok-com', t);
        if (t[0] === '"' || t[0] === "'") return span('tok-str', t);
        if (t[0] === '@') return span('tok-key', t);
        if (t[0] === '#') return span('tok-num', t);
        if (/^[.\d-]/.test(t)) return span('tok-num', t);
        return span('tok-attr', t);
      }
    });
  }

  /* Comment syntax differs per language, so the highlighter picks the marker
     that language actually uses instead of treating every # as a comment. */
  const HASH_COMMENT = { python: 1, shell: 1, yaml: 1, props: 1, gradle: 1 };
  const DASH_COMMENT = { sql: 1 };

  function highlightCode(src, lang) {
    const parts = ['\\/\\*[\\s\\S]*?\\*\\/'];
    if (HASH_COMMENT[lang]) parts.push('#[^\\n]*');
    else if (DASH_COMMENT[lang]) parts.push('--[^\\n]*');
    else parts.push('\\/\\/[^\\n]*');
    parts.push('"""[\\s\\S]*?"""');
    parts.push("'''[\\s\\S]*?'''");
    parts.push('`(?:\\\\.|[^`\\\\])*`');
    parts.push('"(?:\\\\.|[^"\\\\\\n])*"');
    parts.push("'(?:\\\\.|[^'\\\\\\n])*'");
    parts.push('\\b\\d+(?:\\.\\d+)?\\b');
    parts.push('\\b[A-Za-z_$][\\w$]*\\b');
    const re = new RegExp(parts.join('|'), 'g');
    const keyword = {};
    (KEYWORDS[lang] || '').split(' ').forEach((w) => { if (w) keyword[w] = 1; });
    return tokenize(src, re, {
      plain: (t) => esc(t),
      token: (t) => {
        if (/^\/\*|^\/\/|^#|^--/.test(t)) return span('tok-com', t);
        if (/^["'`]/.test(t)) return span('tok-str', t);
        if (/^\d/.test(t)) return span('tok-num', t);
        if (keyword[t]) return span('tok-key', t);
        if (/^[A-Z][A-Za-z0-9_]*$/.test(t)) return span('tok-fn', t);
        return esc(t);
      }
    });
  }

  /* YAML has no statements, so keys are what a reader looks for. */
  function highlightYaml(src) {
    return src.split('\n').map((line) => {
      const m = line.match(/^(\s*)([\w.-]+)(\s*:)([\s\S]*)$/);
      if (!m) return highlightCode(line, 'yaml');
      return esc(m[1]) + span('tok-attr', m[2]) + esc(m[3]) + highlightCode(m[4], 'yaml');
    }).join('\n');
  }

  function highlightMarkdown(src) {
    return src.split('\n').map((line) => {
      if (/^\s*#{1,6}\s/.test(line)) return span('tok-key', line);
      if (/^\s*```/.test(line)) return span('tok-com', line);
      if (/^\s*[-*+]\s/.test(line)) return span('tok-attr', line);
      if (/^\s*>/.test(line)) return span('tok-com', line);
      return esc(line);
    }).join('\n');
  }

  function highlight(source, lang) {
    const src = String(source == null ? '' : source);
    if (lang === 'html' || lang === 'xml') return highlightHTML(src);
    if (lang === 'css') return highlightCSS(src);
    if (lang === 'md') return highlightMarkdown(src);
    if (lang === 'yaml') return highlightYaml(src);
    if (lang === 'text') return esc(src);
    return highlightCode(src, lang);
  }

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };

  class Editor {
    constructor(opts) {
      this.gutter = opts.gutter;
      this.pre = opts.pre;
      this.hl = opts.hl;
      this.code = opts.code;
      this.wrapEl = opts.wrapEl;
      this.onChange = opts.onChange || function () {};
      this.onCursor = opts.onCursor || function () {};
      this.lang = 'text';
      this.tabSize = 2;
      this.history = [];
      this.future = [];
      this._bind();
    }

    _bind() {
      const ta = this.code;
      ta.addEventListener('input', () => this._sync());
      ta.addEventListener('scroll', () => this._scroll());
      ta.addEventListener('keydown', (e) => this._key(e));
      ta.addEventListener('click', () => this._cursor());
      ta.addEventListener('keyup', () => this._cursor());
      ta.addEventListener('blur', () => this._cursor());
      this._sync();
    }

    setOptions(o) {
      if (o.tabSize) this.tabSize = o.tabSize;
      if (o.fontSize) {
        this.code.style.fontSize = o.fontSize + 'px';
        this.pre.style.fontSize = o.fontSize + 'px';
        this.gutter.style.fontSize = Math.max(10, o.fontSize - 1) + 'px';
      }
      if (typeof o.wrap === 'boolean') {
        this.code.classList.toggle('wrap', o.wrap);
        this.pre.classList.toggle('wrap', o.wrap);
        this.code.setAttribute('wrap', o.wrap ? 'soft' : 'off');
      }
      this._sync();
    }

    setLang(path) {
      this.lang = langOf(path);
      this._render();
    }

    setValue(text) {
      this.code.value = text == null ? '' : String(text);
      this._sync();
    }

    getValue() {
      return this.code.value;
    }

    focus() { this.code.focus(); }

    _render() {
      const src = this.code.value;
      this.hl.innerHTML = highlight(src, this.lang) + '\n';
      const lines = src.split('\n').length;
      let nums = '';
      for (let i = 1; i <= Math.max(lines, 1); i++) nums += i + '\n';
      this.gutter.textContent = nums;
      this.pre.scrollTop = this.code.scrollTop;
      this.pre.scrollLeft = this.code.scrollLeft;
      this.gutter.scrollTop = this.code.scrollTop;
    }

    _scroll() {
      this.pre.scrollTop = this.code.scrollTop;
      this.pre.scrollLeft = this.code.scrollLeft;
      this.gutter.scrollTop = this.code.scrollTop;
    }

    _sync() {
      this._render();
      this._cursor();
      this.onChange(this.code.value);
    }

    _cursor() {
      const pos = this.code.selectionStart;
      const before = this.code.value.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      this.onCursor(line, col);
    }

    gotoLine(line) {
      const lines = this.code.value.split('\n');
      const target = Math.max(1, Math.min(lines.length, line | 0));
      let at = 0;
      for (let i = 0; i < target - 1; i++) at += lines[i].length + 1;
      this.code.focus();
      this.code.setSelectionRange(at, at + lines[target - 1].length);
      const lh = parseFloat(getComputedStyle(this.code).lineHeight) || 20;
      this.code.scrollTop = Math.max(0, (target - 3) * lh);
      this._scroll();
      this._cursor();
    }

    _insert(text, caretBack) {
      const ta = this.code;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      const at = start + text.length - (caretBack || 0);
      ta.setSelectionRange(at, at);
      this._sync();
    }

    _key(e) {
      const ta = this.code;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          const start = ta.selectionStart;
          const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
          const slice = ta.value.slice(lineStart, lineStart + this.tabSize);
          if (/^ +$/.test(slice)) {
            ta.value = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + slice.length);
            ta.setSelectionRange(Math.max(lineStart, start - slice.length), Math.max(lineStart, start - slice.length));
            this._sync();
          }
          return;
        }
        const spaces = ' '.repeat(this.tabSize);
        if (ta.selectionStart !== ta.selectionEnd) {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const block = ta.value.slice(start, end).split('\n').map((l) => spaces + l).join('\n');
          ta.value = ta.value.slice(0, start) + block + ta.value.slice(end);
          ta.setSelectionRange(start, start + block.length);
          this._sync();
        } else {
          this._insert(spaces);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const start = ta.selectionStart;
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const line = ta.value.slice(lineStart, start);
        const indent = (line.match(/^[ \t]*/) || [''])[0];
        const prev = ta.value.slice(start - 1, start);
        const next = ta.value.slice(start, start + 1);
        const opens = /[{[(]\s*$/.test(line);
        let extra = '';
        if (opens) extra = ' '.repeat(this.tabSize);
        if (opens && /[}\])]/.test(next)) {
          this._insert('\n' + indent + extra + '\n' + indent, indent.length + 1);
          return;
        }
        this._insert('\n' + indent + extra);
        return;
      }
      if (PAIRS[e.key] && !e.ctrlKey && !e.metaKey) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start !== end) {
          e.preventDefault();
          const sel = ta.value.slice(start, end);
          ta.value = ta.value.slice(0, start) + e.key + sel + PAIRS[e.key] + ta.value.slice(end);
          ta.setSelectionRange(start + 1, start + 1 + sel.length);
          this._sync();
          return;
        }
        const next = ta.value.slice(start, start + 1);
        if (!next || /[\s)\]}>,;]/.test(next)) {
          e.preventDefault();
          this._insert(e.key + PAIRS[e.key], 1);
        }
      }
    }

    /* ── words, completion, formatting ── */
    wordAt() {
      const ta = this.code;
      const pos = ta.selectionStart;
      const value = ta.value;
      let start = pos;
      while (start > 0 && /[A-Za-z0-9_$]/.test(value[start - 1])) start--;
      let end = pos;
      while (end < value.length && /[A-Za-z0-9_$]/.test(value[end])) end++;
      return { word: value.slice(start, end), start: start, end: end };
    }

    /* Candidates come from the language keywords, this file and the rest of
       the project, so the list shows what the user can actually type. */
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
      (KEYWORDS[this.lang] || '').split(' ').forEach((w) => push(w, 'keyword'));
      (this.code.value.match(/[A-Za-z_$][\w$]{1,40}/g) || []).forEach((w) => push(w, 'word'));
      (extraWords || []).forEach((w) => push(w, 'symbol'));
      out.sort((a, b) => (a.kind === b.kind ? a.text.localeCompare(b.text)
        : a.kind === 'keyword' ? -1 : 1));
      return { items: out.slice(0, 12), at: at };
    }

    insertCompletion(text) {
      const at = this.wordAt();
      const ta = this.code;
      ta.value = ta.value.slice(0, at.start) + text + ta.value.slice(at.end);
      const caret = at.start + text.length;
      ta.setSelectionRange(caret, caret);
      this._sync();
      this.focus();
    }

    /* JSON is reformatted for real (parse + stringify); other languages are
       re-indented by bracket depth, the same rule the Enter key already uses. */
    format() {
      const src = this.code.value;
      if (!src.trim()) return false;
      let next = src;
      if (this.lang === 'json') {
        try { next = JSON.stringify(JSON.parse(src), null, 2) + '\n'; } catch (e) { next = src; }
      }
      if (next === src) {
        const unit = ' '.repeat(this.tabSize);
        let depth = 0;
        next = src.split('\n').map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          const leadClose = (trimmed.match(/^[}\]\)]/) || []).length;
          const level = Math.max(0, depth - leadClose);
          depth = Math.max(0, depth + (trimmed.match(/[{([]/g) || []).length
            - (trimmed.match(/[})\]]/g) || []).length);
          return unit.repeat(level) + trimmed;
        }).join('\n');
      }
      if (next === src) return false;
      const caret = Math.min(this.code.selectionStart, next.length);
      this.code.value = next;
      this.code.setSelectionRange(caret, caret);
      this._sync();
      return true;
    }

    /* ── find / replace ── */
    find(query, backward) {
      if (!query) return false;
      const ta = this.code;
      const from = backward ? ta.selectionStart - 1 : ta.selectionEnd;
      const hay = backward ? ta.value.slice(0, Math.max(0, from + 1)) : ta.value;
      let at = backward ? hay.lastIndexOf(query) : hay.indexOf(query, from);
      if (at < 0) at = backward ? ta.value.lastIndexOf(query) : ta.value.indexOf(query);
      if (at < 0) return false;
      ta.focus();
      ta.setSelectionRange(at, at + query.length);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      const line = ta.value.slice(0, at).split('\n').length;
      ta.scrollTop = Math.max(0, (line - 4) * lh);
      this._scroll();
      this._cursor();
      return true;
    }

    replaceOne(query, replacement) {
      if (!query) return false;
      const ta = this.code;
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel !== query) {
        if (!this.find(query, false)) return false;
      }
      const start = ta.selectionStart;
      ta.value = ta.value.slice(0, start) + replacement + ta.value.slice(ta.selectionEnd);
      ta.setSelectionRange(start + replacement.length, start + replacement.length);
      this._sync();
      return true;
    }
  }

  window.IdeEditor = {
    create: (o) => new Editor(o),
    highlight: highlight,
    langOf: langOf,
    langName: (path) => LANG_LABELS[langOf(path)] || 'Plain text',
    languages: Object.keys(LANG_LABELS).map((id) => ({ id: id, label: LANG_LABELS[id], exts: LANGS[id] || [] }))
  };
})();
