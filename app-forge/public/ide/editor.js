/* A small code editor: textarea for input, highlighted <pre> underneath,
   gutter for line numbers, find/replace, indentation and bracket pairs.
   No build step and no CDN, so it works offline and on a phone. */
(function () {
  'use strict';

  const LANGS = {
    html: ['html', 'htm', 'xhtml', 'vue', 'svg'],
    css: ['css', 'scss', 'less'],
    js: ['js', 'mjs', 'jsx', 'ts', 'tsx', 'json'],
    java: ['java', 'kt', 'kts', 'gradle'],
    xml: ['xml', 'plist'],
    python: ['py'],
    php: ['php'],
    md: ['md', 'markdown'],
    text: ['txt', 'yml', 'yaml', 'properties', 'ini', 'toml', 'sh', 'bat', 'pro']
  };

  const KEYWORDS = {
    js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined interface type enum implements public private protected readonly as from get set',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var val fun override lateinit companion object data when is in as true false null',
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda none nonlocal not or pass raise return True False None try while with yield self print',
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield true false null',
    css: 'important media supports keyframes font-face import charset page'
  };

  function langOf(path) {
    const ext = String(path || '').split('.').pop().toLowerCase();
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

  function highlightCode(src, lang) {
    const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;
    const keyword = {};
    (KEYWORDS[lang] || '').split(' ').forEach((w) => { if (w) keyword[w] = 1; });
    return tokenize(src, re, {
      plain: (t) => esc(t),
      token: (t) => {
        if (t.startsWith('/*') || t.startsWith('//')) return span('tok-com', t);
        if (t[0] === '#' && lang !== 'css') return span('tok-com', t);
        if (t[0] === '"' || t[0] === "'" || t[0] === '`') return span('tok-str', t);
        if (/^\d/.test(t)) return span('tok-num', t);
        if (keyword[t]) return span('tok-key', t);
        if (/^[A-Z][A-Za-z0-9_]*$/.test(t)) return span('tok-fn', t);
        return esc(t);
      }
    });
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

  window.IdeEditor = { create: (o) => new Editor(o), highlight: highlight, langOf: langOf };
})();
