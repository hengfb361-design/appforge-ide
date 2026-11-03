# -*- coding: utf-8 -*-
"""Shared single-page chat UI (ChatGPT-style) served by local_app.py.

It is plain HTML/CSS/JS with no build step: Markdown rendering, code blocks with
copy buttons, image attachments, source chips, chat export and local history.
"""

PAGE = r"""<!doctype html>
<html lang="km">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Buffy AI — បង្កើតរូបភាព</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Khmer:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
<style>
  :root{
    --bg:#0f1012; --panel:#17181b; --panel-2:#1d1f23; --border:#2a2d33;
    --text:#ececf1; --muted:#9aa0aa; --accent:#10a37f; --accent-2:#7c5cff;
    --user:#2b2f36; --code:#0b0c0e; --radius:16px;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; background:var(--bg); color:var(--text);
    font-family:"Inter","Noto Sans Khmer",system-ui,-apple-system,"Segoe UI",sans-serif;
    font-size:15px; line-height:1.65; -webkit-font-smoothing:antialiased;
  }
  button{font-family:inherit}
  .app{display:flex; height:100dvh; overflow:hidden}

  /* sidebar */
  .sidebar{
    width:272px; flex:0 0 272px; background:var(--panel); border-right:1px solid var(--border);
    display:flex; flex-direction:column; padding:14px; gap:12px;
  }
  .brand{display:flex; align-items:center; gap:10px; padding:6px 6px 2px}
  .brand .logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;font-size:17px}
  .brand h1{font-size:16px;margin:0;font-weight:700;letter-spacing:.2px}
  .brand small{display:block;color:var(--muted);font-size:11px;font-weight:500;line-height:1.2}
  .new-chat{
    display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 12px;
    border-radius:12px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);
    font-size:14px;font-weight:600;cursor:pointer;transition:.15s;
  }
  .new-chat:hover{background:#24272d;border-color:#3a3e46}
  .side-label{font-size:11px;text-transform:uppercase;letter-spacing:.9px;color:var(--muted);padding:6px 6px 0;font-weight:600}
  .field{display:flex;flex-direction:column;gap:6px;padding:0 4px}
  .field label{font-size:12.5px;color:var(--muted);font-weight:500}
  select{
    width:100%;padding:9px 10px;border-radius:10px;background:var(--panel-2);color:var(--text);
    border:1px solid var(--border);font-size:13.5px;outline:none;cursor:pointer;
  }
  select:focus{border-color:var(--accent)}
  input[type=text],input[type=password]{
    width:100%;padding:9px 10px;border-radius:10px;background:var(--panel-2);color:var(--text);
    border:1px solid var(--border);font-size:12.5px;outline:none;font-family:inherit;
  }
  input[type=text]:focus,input[type=password]:focus{border-color:var(--accent)}
  .conn{font-size:11px;color:var(--muted);padding:0 6px;line-height:1.45;min-height:15px;word-break:break-word}
  .conn.ok{color:#3ddc97}
  .conn.bad{color:#ff8f8f}
  .conn .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#6b7280;vertical-align:middle}
  .conn.ok .dot{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.22);animation:dotpulse 2s infinite}
  @keyframes dotpulse{50%{box-shadow:0 0 0 6px rgba(59,130,246,0)}}
  .toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:var(--panel-2);border:1px solid var(--border);cursor:pointer}
  .toggle span{font-size:13px;display:flex;align-items:center;gap:8px}
  .toggle input{display:none}
  .switch{width:36px;height:20px;border-radius:20px;background:#3a3e46;position:relative;transition:.18s;flex:0 0 auto}
  .switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.18s}
  .toggle input:checked + .switch{background:var(--accent)}
  .toggle input:checked + .switch::after{transform:translateX(16px)}
  .side-actions{display:flex;gap:8px;padding:0 4px}
  .ghost{
    flex:1;padding:9px 8px;border-radius:10px;background:transparent;border:1px solid var(--border);
    color:var(--muted);font-size:12.5px;cursor:pointer;transition:.15s;
  }
  .ghost:hover{color:var(--text);border-color:#3a3e46;background:var(--panel-2)}
  .side-foot{margin-top:auto;font-size:11px;color:#6f7580;padding:6px;line-height:1.5}

  /* main */
  .main{flex:1;display:flex;flex-direction:column;min-width:0;position:relative;background:var(--bg)}
  .topbar{
    display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);
    background:rgba(15,16,18,.85);backdrop-filter:blur(8px);z-index:5;
  }
  .icon-btn{
    width:36px;height:36px;border-radius:10px;display:grid;place-items:center;border:1px solid transparent;
    background:transparent;color:var(--muted);cursor:pointer;font-size:16px;
  }
  .icon-btn:hover{background:var(--panel-2);color:var(--text)}
  #menuBtn{display:none}
  .top-title{font-size:14px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pill{font-size:11.5px;color:var(--muted);border:1px solid var(--border);padding:3px 9px;border-radius:999px;background:var(--panel-2);white-space:nowrap}

  .chat{flex:1;overflow-y:auto;scroll-behavior:smooth;padding:22px 16px 8px}
  .thread{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:22px}

  /* empty state */
  .empty{max-width:720px;margin:6vh auto 0;text-align:center;padding:0 8px}
  .empty .big{
    width:62px;height:62px;border-radius:20px;margin:0 auto 18px;display:grid;place-items:center;font-size:29px;
    background:linear-gradient(135deg,var(--accent),var(--accent-2));box-shadow:0 14px 40px rgba(124,92,255,.28)
  }
  .empty h2{font-size:23px;margin:0 0 8px;font-weight:700}
  .empty p{color:var(--muted);margin:0 0 26px;font-size:14px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
  .chip{
    padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--panel);
    color:var(--text);font-size:13px;cursor:pointer;transition:.15s;text-align:left;
  }
  .chip:hover{border-color:var(--accent);background:var(--panel-2);transform:translateY(-1px)}

  /* messages */
  .msg{display:flex;gap:12px;align-items:flex-start}
  .msg .avatar{
    width:30px;height:30px;border-radius:9px;flex:0 0 auto;display:grid;place-items:center;font-size:15px;margin-top:2px;
    background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff
  }
  .msg .body{min-width:0;flex:1}
  .msg.user{justify-content:flex-end}
  .msg.user .body{flex:0 1 auto;max-width:82%}
  .msg.user .bubble{background:var(--user);padding:11px 15px;border-radius:16px 16px 4px 16px;white-space:pre-wrap;word-wrap:break-word}
  .msg.user .thumbs{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-bottom:8px}
  .msg.user .thumbs img{width:104px;height:104px;object-fit:cover;border-radius:12px;border:1px solid var(--border)}

  .md{word-wrap:break-word;overflow-wrap:anywhere}
  .md > *:first-child{margin-top:0}
  .md > *:last-child{margin-bottom:0}
  .md h1,.md h2,.md h3,.md h4{margin:1.3em 0 .55em;line-height:1.3;font-weight:700}
  .md h1{font-size:1.42em}.md h2{font-size:1.26em}.md h3{font-size:1.1em}.md h4{font-size:1em}
  .md p{margin:.65em 0}
  .md ul,.md ol{margin:.6em 0;padding-left:1.5em}
  .md li{margin:.28em 0}
  .md a{color:#7fb2ff;text-decoration:none}
  .md a:hover{text-decoration:underline}
  .md blockquote{margin:.7em 0;padding:.4em 0 .4em 1em;border-left:3px solid var(--accent);color:#c8ccd4}
  .md table{border-collapse:collapse;width:100%;margin:.8em 0;font-size:13.5px;display:block;overflow-x:auto}
  .md th,.md td{border:1px solid var(--border);padding:7px 10px;text-align:left}
  .md th{background:var(--panel-2);font-weight:600}
  .md code{
    background:rgba(255,255,255,.08);padding:.15em .4em;border-radius:5px;font-size:.88em;
    font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  .md pre{position:relative;background:var(--code);border:1px solid var(--border);border-radius:12px;padding:14px 14px 12px;overflow-x:auto;margin:.9em 0}
  .md pre code{background:none;padding:0;font-size:12.8px;line-height:1.6}
  .copy-code{
    position:absolute;top:8px;right:8px;font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;
    background:#22252b;border:1px solid var(--border);color:var(--muted);opacity:0;transition:.15s;
  }
  .md pre:hover .copy-code{opacity:1}
  .copy-code:hover{color:var(--text)}

  .msg-actions{display:flex;gap:6px;margin-top:8px;opacity:0;transition:.15s}
  .msg:hover .msg-actions{opacity:1}
  .msg-actions button{background:transparent;border:1px solid transparent;color:var(--muted);font-size:11.5px;padding:4px 8px;border-radius:7px;cursor:pointer}
  .msg-actions button:hover{background:var(--panel-2);color:var(--text);border-color:var(--border)}

  .status{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;margin-bottom:6px}
  .status .spinner{width:13px;height:13px;border-radius:50%;border:2px solid #3a3e46;border-top-color:var(--accent);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .blink{display:inline-block;width:7px;height:15px;background:var(--accent);border-radius:2px;margin-left:3px;vertical-align:-2px;animation:blink 1s steps(2) infinite}
  @keyframes blink{50%{opacity:0}}
  .sources{margin-top:12px;border-top:1px solid var(--border);padding-top:10px}
  .sources .lbl{font-size:11.5px;color:var(--muted);margin-bottom:7px;font-weight:600;letter-spacing:.3px}
  .source-list{display:flex;flex-wrap:wrap;gap:8px}
  .source{
    display:inline-flex;align-items:center;gap:6px;max-width:260px;padding:6px 11px;border-radius:999px;
    background:var(--panel-2);border:1px solid var(--border);color:#cfd3da;font-size:12px;text-decoration:none;
  }
  .source:hover{border-color:var(--accent);color:#fff}
  .source b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gen-img{margin-top:10px}
  .gen-img img{max-width:100%;border-radius:14px;border:1px solid var(--border);display:block}
  .gen-img a{display:inline-block;margin-top:8px;font-size:12px;color:#7fb2ff;text-decoration:none}
  .gen-img .vid-btn{
    margin-top:8px;margin-left:10px;padding:6px 12px;border-radius:9px;cursor:pointer;border:none;
    background:linear-gradient(135deg,var(--accent-2),var(--accent));color:#fff;font-size:12px;font-weight:600;
  }
  .gen-img .vid-btn:hover{filter:brightness(1.1)}
  .gen-img .vid-btn:disabled{opacity:.5;cursor:not-allowed}
  .gen-video{margin-top:10px}
  .gen-video video{max-width:100%;border-radius:14px;border:1px solid var(--border);display:block;background:#000}
  .gen-video a{display:inline-block;margin-top:8px;font-size:12px;color:#7fb2ff;text-decoration:none}

  /* composer */
  .composer-wrap{padding:10px 16px 16px;background:linear-gradient(to top,var(--bg) 55%,rgba(15,16,18,0))}
  .composer{max-width:820px;margin:0 auto}
  .attachments{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .attachments .att{position:relative}
  .attachments img{width:62px;height:62px;object-fit:cover;border-radius:10px;border:1px solid var(--border)}
  .attachments .rm{position:absolute;top:-6px;right:-6px;width:19px;height:19px;border-radius:50%;border:none;background:#3a3e46;color:#fff;font-size:11px;cursor:pointer;display:grid;place-items:center}
  .box{
    display:flex;align-items:flex-end;gap:8px;background:var(--panel-2);border:1px solid var(--border);
    border-radius:18px;padding:8px 8px 8px 12px;transition:.15s;box-shadow:0 8px 28px rgba(0,0,0,.28)
  }
  .box:focus-within{border-color:#3f8f79}
  .box.gen:focus-within{border-color:var(--accent-2)}
  #input{
    flex:1;resize:none;border:none;outline:none;background:transparent;color:var(--text);
    font-family:inherit;font-size:15px;line-height:1.55;max-height:190px;padding:7px 2px;
  }
  #input::placeholder{color:#767c86}
  .send{
    width:38px;height:38px;flex:0 0 auto;border-radius:12px;border:none;cursor:pointer;font-size:16px;
    background:var(--accent);color:#06241c;display:grid;place-items:center;transition:.15s;
  }
  .send:hover:not(:disabled){filter:brightness(1.12)}
  .send:disabled{opacity:.45;cursor:not-allowed}
  .send.gen{background:var(--accent-2);color:#fff}
  .send.stop{background:#c0392b;color:#fff}
  .hint{max-width:820px;margin:8px auto 0;text-align:center;font-size:11px;color:#6f7580}

  @media (max-width:820px){
    #menuBtn{display:grid}
    .sidebar{
      position:fixed;inset:0 auto 0 0;z-index:40;transform:translateX(-100%);transition:transform .22s ease;
      box-shadow:0 0 40px rgba(0,0,0,.55);height:100dvh
    }
    .sidebar.open{transform:none}
    .scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:35;display:none}
    .scrim.show{display:block}
    .msg.user .body{max-width:92%}
    .chat{padding:16px 10px 4px}
    .top-title{display:none}
  }
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <div class="logo">✦</div>
      <div>
        <h1>Buffy AI</h1>
        <small>បង្កើតរូបភាពដោយ AI</small>
      </div>
    </div>
    <button class="new-chat" id="newChat">＋ រូបភាពថ្មី</button>

    <div class="side-label">Server រូបភាព · វីដេអូ — Colab/Kaggle</div>
    <div class="conn" id="connStatus"><span class="dot"></span>រង់ចាំ server …</div>
    <div class="side-actions">
      <button class="ghost" id="copyCmd">📋 ចម្លងបន្ទាត់ Colab</button>
    </div>
    <label class="toggle" for="imageFast">
      <span>⚡ លឿន (១២ ជំហាន)</span>
      <input type="checkbox" id="imageFast" checked />
      <i class="switch"></i>
    </label>
    <label class="toggle" for="videoLong">
      <span>🎬 វីដេអូ ១០ វិនាទី (យឺត)</span>
      <input type="checkbox" id="videoLong" />
      <i class="switch"></i>
    </label>

    <div class="side-actions">
      <button class="ghost" id="downloadChat">⬇️ ទាញយក</button>
      <button class="ghost" id="clearChat">🗑 លាង</button>
    </div>

    <div class="side-foot">
      រូបភាព និងប្រវត្តិ រក្សាទុកក្នុង browser នេះប៉ុណ្ណោះ
    </div>
  </aside>
  <div class="scrim" id="scrim"></div>

  <main class="main">
    <div class="topbar">
      <button class="icon-btn" id="menuBtn" aria-label="menu">☰</button>
      <div class="top-title" id="topTitle">រូបភាពថ្មី</div>
      <span class="pill" id="modePill">🎨 បង្កើតរូបភាព</span>
    </div>

    <div class="chat" id="chat">
      <div class="thread" id="thread">
        <div class="empty" id="empty">
          <div class="big">✦</div>
          <h2>ពិពណ៌នារូបភាពដែលអ្នកចង់បាន</h2>
          <p>សរសេរអ្វីដែលអ្នកចង់ឃើញ រួចចុចផ្ញើ — AI នឹងគូររូបភាពឱ្យ</p>
          <div class="chips">
            <button class="chip">ឆ្មាញ៉ាំកាហ្វេ ស្ទីលគំនូរទឹក</button>
            <button class="chip">ភ្នំស្វាយពេលថ្ងៃលិច ស្ទីលថតរូប</button>
            <button class="chip">ទីក្រុងអនាគតពេលយប់ ពន្លឺស្វាយ</button>
            <button class="chip">ផ្កាឈូកក្នុងស្រះ ស្ទីលគំនូរប្រេង</button>
          </div>
        </div>
      </div>
    </div>

    <div class="composer-wrap">
      <div class="composer">
        <div class="attachments" id="attachments"></div>
        <div class="box" id="box">
          <input type="file" id="fileInput" accept="image/*" multiple hidden />
          <textarea id="input" rows="1" placeholder="ពិពណ៌នារូបភាពដែលអ្នកចង់បាន… (Enter ដើម្បីផ្ញើ)"></textarea>
          <button class="send" id="sendBtn" title="ផ្ញើ">➤</button>
        </div>
        <div class="hint">រូបភាពបង្កើតដោយ AI · រូបដំបូងយូរ ព្រោះត្រូវ load model</div>
      </div>
    </div>
  </main>
</div>

<script>
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const thread = $("#thread");
  const emptyEl = $("#empty");
  const chatEl = $("#chat");
  const input = $("#input");
  const sendBtn = $("#sendBtn");
  const box = $("#box");
  const attEl = $("#attachments");
  const fileInput = $("#fileInput");
  /* The page is image-only now: the model picker, web search and the image
     toggle are gone from the sidebar, so keep inert stand-ins for the few
     helpers that still read them. */
  const modelSel = { value: "local" };
  const webSearch = { checked: false };
  const imageMode = { checked: true };
  const modePill = $("#modePill");
  const videoLong = $("#videoLong");
  const topTitle = $("#topTitle");
  const connStatusEl = $("#connStatus");
  const STORE = "buffy-ai-chat-v2";

  const state = { messages: [], attachments: [], busy: false, controller: null };

  marked.setOptions({ breaks: true, gfm: true });
  const md = (text) => DOMPurify.sanitize(marked.parse(text || ""), { ADD_ATTR: ["target"] });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------------- persistence ---------------- */
  function save() {
    const data = JSON.stringify({
      messages: state.messages.map((m) => ({ role: m.role, text: m.text, sources: m.sources || [], img: m.img || null, images: m.images || [] })),
      model: modelSel.value,
      web: webSearch.checked,
    });
    try { localStorage.setItem(STORE, data); } catch (e) { /* quota, ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.messages) && d.messages.length) {
        state.messages = d.messages;
        if (d.model) modelSel.value = d.model;
        if (typeof d.web === "boolean") webSearch.checked = d.web;
      }
    } catch (e) { /* ignore */ }
  }

  /* -------- Auto-connection to the GPU server (no fields to fill) -------- */
  /* The Kaggle/Colab script POSTs its tunnel URL to this server, so nothing is
     pasted in the browser. We only poll /api/health and colour the dot. */
  function endpoint(path) { return path; }
  function requestHeaders(json) { return json ? { "Content-Type": "application/json" } : {}; }
  function setConn(text, kind) {
    connStatusEl.className = "conn" + (kind ? " " + kind : "");
    connStatusEl.innerHTML = '<span class="dot"></span>' + esc(text || "");
  }
  async function pollConnection() {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const d = await res.json();
      const r = d.remote || {};
      if (r.alive) {
        setConn("ភ្ជាប់ស្វ័យប្រវត្តិ · server GPU ដំណើរការ", "ok");
      } else if (r.url) {
        setConn("បានចុះทะเบียน តែ server មិនឆ្លើយ — ពិនិត្យ Kaggle", "bad");
      } else if (d.image === "comfyui") {
        setConn("server នេះមាន GPU ដោយខ្លួនឯង", "ok");
      } else {
        setConn("រង់ចាំ Kaggle/Colab — run បន្ទាត់តែមួយ វាភ្ជាប់ឯង", "");
      }
    } catch (e) {
      setConn("មិនអាចភ្ជាប់ទៅ server", "bad");
    }
  }
  const KAGGLE_CMD = "!curl -fsSL -o /content/buffy-start.sh https://raw.githubusercontent.com/hengfb361-design/buffy-ai/main/kaggle-start.sh && bash /content/buffy-start.sh";
  const copyBtn = $("#copyCmd");
  if (copyBtn) copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(KAGGLE_CMD);
      copyBtn.textContent = "✅ ចម្លងរួច";
      setTimeout(() => { copyBtn.textContent = "📋 ចម្លងបន្ទាត់ Colab"; }, 2000);
    } catch (e) {
      setConn("ចម្លងស្វ័យប្រវត្តិមិនបាន — សូមថតដោយដៃ", "bad");
    }
  };
  pollConnection();
  setInterval(pollConnection, 15000);

  /* ---------------- rendering ---------------- */
  function hideEmpty() { if (emptyEl && emptyEl.parentNode) emptyEl.remove(); }

  function newBubble(role, msg) {
    hideEmpty();
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    let thumbs = "";
    if (role === "user" && msg && msg.images && msg.images.length) {
      thumbs = '<div class="thumbs">' + msg.images.map((im) => '<img src="' + esc(im.url) + '" alt="image" />').join("") + "</div>";
    }
    const avatar = role === "assistant" ? '<div class="avatar">✦</div>' : "";
    const inner = role === "user"
      ? '<div class="body">' + thumbs + '<div class="bubble">' + esc(msg ? msg.text : "") + "</div></div>"
      : '<div class="avatar">✦</div><div class="body"><div class="md"></div><div class="status" hidden><i class="spinner"></i><span>កំពុងគិត…</span></div><div class="cfg"></div></div>';
    wrap.innerHTML = inner;
    thread.appendChild(wrap);
    return wrap;
  }

  function renderAssistantBody(node, m) {
    const body = node.querySelector(".md");
    body.innerHTML = md(m.text || "") + (state.busy && !m.done ? '<i class="blink"></i>' : "");
    body.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy-code")) return;
      const b = document.createElement("button");
      b.className = "copy-code";
      b.textContent = "copy";
      b.onclick = () => {
        const code = pre.querySelector("code");
        navigator.clipboard.writeText(code ? code.innerText : pre.innerText).then(() => {
          b.textContent = "copied ✓";
          setTimeout(() => (b.textContent = "copy"), 1200);
        });
      };
      pre.appendChild(b);
    });
    const cfg = node.querySelector(".cfg");
    let html = "";
    if (m.img) {
      html += '<div class="gen-img"><img src="' + esc(m.img.url) + '" alt="generated" />' +
        '<a href="' + esc(m.img.url) + '" download="buffy-ai.png">⬇️ ទាញយករូបភាព</a>' +
        (m.video ? "" : '<button class="vid-btn" data-act="video">🎬 ធ្វើវីដេអូ</button>') +
        "</div>";
    }
    if (m.video && m.video.url) {
      html += '<div class="gen-video"><video src="' + esc(m.video.url) + '" controls loop playsinline></video>' +
        '<a href="' + esc(m.video.url) + '" download="buffy-ai.webm">⬇️ ទាញយកវីដេអូ</a></div>';
    }
    if (m.sources && m.sources.length) {
      html += '<div class="sources"><div class="lbl">ប្រភព</div><div class="source-list">' +
        m.sources.map((s) => {
          let host = s.url;
          try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) {}
          return '<a class="source" href="' + esc(s.url) + '" target="_blank" rel="noopener"><span>🔗</span><b>' + esc(host) + "</b></a>";
        }).join("") + "</div></div>";
    }
    if (m.text && m.done) {
      html += '<div class="msg-actions"><button data-act="copy">⧉ ចម្លង</button></div>';
    }
    cfg.innerHTML = html;
    const copyBtn = cfg.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(m.text || "");
    const vidBtn = cfg.querySelector('[data-act="video"]');
    if (vidBtn) vidBtn.onclick = () => startVideo(m);
  }

  function setStatus(node, text) {
    const st = node.querySelector(".status");
    if (!st) return;
    if (!text) { st.hidden = true; return; }
    st.hidden = false;
    st.querySelector("span").textContent = text;
  }

  function scrollToBottom(force) {
    const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 180;
    if (force || nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
  }

  function renderAll() {
    thread.innerHTML = "";
    state.messages.forEach((m) => {
      const node = newBubble(m.role, m);
      if (m.role === "assistant") {
        m.done = true;
        renderAssistantBody(node, m);
      }
    });
    scrollToBottom(true);
    if (!state.messages.length) {
      // rebuild empty state
      const e = document.createElement("div");
      e.className = "empty";
      e.id = "empty";
      e.innerHTML = '<div class="big">✦</div><h2>ពិពណ៌នារូបភាពដែលអ្នកចង់បាន</h2>' +
        '<p>សរសេរអ្វីដែលអ្នកចង់ឃើញ រួចចុចផ្ញើ — AI នឹងគូររូបភាពឱ្យ</p>' +
        '<div class="chips">' +
        '<button class="chip">ឆ្មាញ៉ាំកាហ្វេ ស្ទីលគំនូរទឹក</button>' +
        '<button class="chip">ភ្នំស្វាយពេលថ្ងៃលិច ស្ទីលថតរូប</button>' +
        '<button class="chip">ទីក្រុងអនាគតពេលយប់ ពន្លឺស្វាយ</button>' +
        '<button class="chip">ផ្កាឈូកក្នុងស្រះ ស្ទីលគំនូរប្រេវ</button>' +
        "</div>";
      thread.appendChild(e);
      bindChips(e);
    }
  }

  function bindChips(root) {
    (root || document).querySelectorAll(".chip").forEach((c) => {
      c.onclick = () => { input.value = c.textContent; send(); };
    });
  }

  /* ---------------- attachments ---------------- */
  function readFile(file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => {
        const url = fr.result;
        if (file.size < 380 * 1024) return resolve({ data: url.split(",")[1], mime: file.type || "image/jpeg", url });
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let w = img.width, h = img.height;
          const scale = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          const out = cv.toDataURL("image/jpeg", 0.86);
          resolve({ data: out.split(",")[1], mime: "image/jpeg", url: out });
        };
        img.onerror = () => resolve({ data: url.split(",")[1], mime: file.type || "image/jpeg", url });
        img.src = url;
      };
      fr.readAsDataURL(file);
    });
  }

  function renderAttachments() {
    attEl.innerHTML = state.attachments.map((a, i) =>
      '<div class="att"><img src="' + esc(a.url) + '" alt="" /><button class="rm" data-i="' + i + '">✕</button></div>'
    ).join("");
    attEl.querySelectorAll(".rm").forEach((b) => {
      b.onclick = () => { state.attachments.splice(+b.dataset.i, 1); renderAttachments(); };
    });
  }

  fileInput.onchange = async () => {
    const files = [...fileInput.files].slice(0, 4);
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (state.attachments.length >= 4) break;
      state.attachments.push(await readFile(f));
    }
    fileInput.value = "";
    renderAttachments();
  };

  /* ---------------- send / stream ---------------- */
  function setBusy(on) {
    state.busy = on;
    sendBtn.disabled = false;
    sendBtn.classList.toggle("stop", on);
    sendBtn.textContent = on ? "■" : "➤";
    box.classList.toggle("gen", imageMode.checked && !on);
  }

  function historyPayload() {
    return state.messages
      .filter((m) => m.text && (m.role === "user" || m.role === "assistant"))
      .slice(-24)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }));
  }

  function fmtSecs(v) {
    const s = Math.max(0, Math.round(v));
    return s < 60 ? s + " វិនាទី" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* Image generation runs as a server-side job: start it, then poll. One long
     request through the tunnel would time out and leave the spinner hanging. */
  async function runImageJob(text, aMsg, aNode, paint, controller) {
    const fastEl = $("#imageFast");
    const steps = fastEl && fastEl.checked ? 12 : 20;
    setStatus(aNode, "កំពុងផ្ញើទៅ server រូបភាព…");
    const start = await fetch(endpoint("/api/image/start"), {
      method: "POST",
      headers: requestHeaders(true),
      body: JSON.stringify({ prompt: text, width: 1024, height: 1024, steps }),
      signal: controller.signal,
    });
    if (!start.ok) {
      let msg = await start.text();
      try { msg = JSON.parse(msg).detail || msg; } catch (e) {}
      throw new Error(String(msg).slice(0, 220) || "HTTP " + start.status);
    }
    const job = await start.json();
    if (!job.job_id) throw new Error("server មិនផ្តល់ job id");

    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      if (controller.signal.aborted) return;
      let d;
      try {
        const r = await fetch(endpoint("/api/image/status/" + job.job_id), {
          headers: requestHeaders(false),
          signal: controller.signal,
        });
        d = await r.json();
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStatus(aNode, "🎨 កំពុងរង់ចាំ server… " + fmtSecs((Date.now() - t0) / 1000));
        continue;
      }
      const secs = (Date.now() - t0) / 1000;
      if (d.status === "done" && d.data) {
        aMsg.img = { url: "data:" + (d.mime || "image/png") + ";base64," + d.data };
        setStatus(aNode, null);
        paint();
        return;
      }
      if (d.status === "error") throw new Error(d.error || "បង្កើតរូបមិនបាន");
      const stage = d.status === "queued" ? "ចូលជួរ" : "កំពុងបង្កើត";
      setStatus(aNode, "🎨 " + stage + "… " + fmtSecs(secs) + " · " + steps +
        " ជំហាន (រូបដំបូងយូរ ព្រោះ load model)");
    }
  }

  /* Image→video. The picture the user is looking at becomes frame 1, so the
     server only needs that image plus a motion prompt. */
  async function runVideoJob(imageUrl, prompt, aMsg, aNode, paint, controller) {
    const frames = videoLong && videoLong.checked ? 257 : 121;
    setStatus(aNode, "🎬 កំពុងផ្ញើទៅ server វីដេអូ…");
    const start = await fetch(endpoint("/api/video/start"), {
      method: "POST",
      headers: requestHeaders(true),
      body: JSON.stringify({ prompt, image: imageUrl, frames, width: 768, height: 512 }),
      signal: controller.signal,
    });
    if (!start.ok) {
      let msg = await start.text();
      try { msg = JSON.parse(msg).detail || msg; } catch (e) {}
      throw new Error(String(msg).slice(0, 220) || "HTTP " + start.status);
    }
    const job = await start.json();
    if (!job.job_id) throw new Error("server មិនផ្តល់ job id");
    const total = job.frames || frames;
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      if (controller.signal.aborted) return;
      let d;
      try {
        const r = await fetch(endpoint("/api/video/status/" + job.job_id), {
          headers: requestHeaders(false),
          signal: controller.signal,
        });
        d = await r.json();
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStatus(aNode, "🎬 កំពុងរង់ចាំ server… " + fmtSecs((Date.now() - t0) / 1000));
        continue;
      }
      const secs = (Date.now() - t0) / 1000;
      if (d.status === "done" && d.data) {
        aMsg.video = { url: "data:" + (d.mime || "video/webm") + ";base64," + d.data };
        setStatus(aNode, null);
        paint();
        return;
      }
      if (d.status === "error") throw new Error(d.error || "បង្កើតវីដេអូមិនបាន");
      const stage = d.status === "queued" ? "ចូលជួរ" : "កំពុងបង្កើត";
      setStatus(aNode, "🎬 " + stage + "… " + fmtSecs(secs) + " · " + total + " frames (~" +
        ((total - 1) / 24).toFixed(1) + " វិ) — យូរ ៥–១៥ នាទី");
    }
  }

  function startVideo(srcMsg) {
    if (state.busy || !srcMsg || !srcMsg.img) return;
    const lastUser = [...state.messages].reverse().find((m) => m.role === "user" && m.text);
    const prompt = (lastUser ? lastUser.text : "cinematic scene") +
      ", smooth natural motion, cinematic lighting";
    const frames = videoLong && videoLong.checked ? 257 : 121;
    const userMsg = { role: "user", text: "🎬 ធ្វើវីដេអូ " + (frames === 257 ? "១០ វិនាទី" : "៥ វិនាទី") };
    state.messages.push(userMsg);
    newBubble("user", userMsg);
    const aMsg = { role: "assistant", text: "", sources: [], video: null, done: false };
    state.messages.push(aMsg);
    const aNode = newBubble("assistant");
    setBusy(true);
    const controller = new AbortController();
    state.controller = controller;
    let raf = null;
    const paint = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; renderAssistantBody(aNode, aMsg); scrollToBottom(false); });
    };
    runVideoJob(srcMsg.img.url, prompt, aMsg, aNode, paint, controller)
      .catch((err) => {
        if (err && err.name === "AbortError") return;
        aMsg.text = (aMsg.text ? aMsg.text + "\n\n" : "") + "> ⚠️ " + (err.message || err);
      })
      .finally(() => {
        aMsg.done = true;
        setStatus(aNode, null);
        setBusy(false);
        state.controller = null;
        renderAssistantBody(aNode, aMsg);
        scrollToBottom(false);
        save();
      });
  }

  async function send() {
    if (state.busy) return;
    const text = input.value.trim();
    if (!text && !state.attachments.length) return;

    const images = state.attachments.map((a) => ({ data: a.data, mime_type: a.mime }));
    const previews = state.attachments.map((a) => ({ url: a.url }));
    const userMsg = { role: "user", text, images: previews };
    state.messages.push(userMsg);
    const userNode = newBubble("user", userMsg);
    input.value = "";
    autoGrow();
    state.attachments = [];
    renderAttachments();
    scrollToBottom(true);

    const aMsg = { role: "assistant", text: "", sources: [], img: null, done: false };
    state.messages.push(aMsg);
    const aNode = newBubble("assistant");
    setStatus(aNode, "កំពុងតភ្ជាប់…");
    setBusy(true);

    const controller = new AbortController();
    state.controller = controller;
    let raf = null;
    const paint = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; renderAssistantBody(aNode, aMsg); scrollToBottom(false); });
    };

    try {
      if (imageMode.checked) {
        await runImageJob(text, aMsg, aNode, paint, controller);
        return;
      }
      const res = await fetch(endpoint("/api/chat"), {
        method: "POST",
        headers: requestHeaders(true),
        body: JSON.stringify({
          message: text,
          model: modelSel.value,
          web_search: !!webSearch.checked,
          image_mode: !!imageMode.checked,
          images,
          history: historyPayload().slice(0, -1),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let firstToken = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!raw.startsWith("data:")) continue;
          let evt;
          try { evt = JSON.parse(raw.slice(5).trim()); } catch (e) { continue; }
          if (evt.type === "text") {
            if (firstToken) { firstToken = false; setStatus(aNode, null); }
            aMsg.text += evt.text;
            paint();
          } else if (evt.type === "status") {
            setStatus(aNode, evt.text);
          } else if (evt.type === "sources") {
            aMsg.sources = evt.sources || [];
            paint();
          } else if (evt.type === "image") {
            aMsg.img = { url: "data:" + (evt.mime || "image/png") + ";base64," + evt.data };
            paint();
          } else if (evt.type === "error") {
            aMsg.text += (aMsg.text ? "\n\n" : "") + "> ⚠️ " + evt.text;
            paint();
          } else if (evt.type === "done") {
            aMsg.done = true;
          }
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        aMsg.text += "\n\n_(បានបញ្ឈប់)_";
      } else {
        aMsg.text += (aMsg.text ? "\n\n" : "") + "> ⚠️ " + (err.message || err);
      }
    } finally {
      aMsg.done = true;
      setStatus(aNode, null);
      setBusy(false);
      state.controller = null;
      renderAssistantBody(aNode, aMsg);
      scrollToBottom(false);
      save();
      updateTitle();
    }
  }

  /* ---------------- controls ---------------- */
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 190) + "px";
  }
  function updateMode() {
    modePill.textContent = imageMode.checked ? "🎨 បង្កើតរូបភាព" : (webSearch.checked ? "🌐 ស្វែងរក + ជជែក" : "💬 ជជែក");
    input.placeholder = imageMode.checked ? "ពិពណ៌នារូបភាពដែលអ្នកចង់បាន…" : "សួរអ្វីក៏បាន… (Enter ដើម្បីផ្ញើ)";
    box.classList.toggle("gen", imageMode.checked);
  }
  function updateTitle() {
    const first = state.messages.find((m) => m.role === "user");
    topTitle.textContent = first ? first.text.slice(0, 60) : "រូបភាពថ្មី";
  }

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.onclick = () => {
    if (state.busy) {
      if (state.controller) state.controller.abort();
      return;
    }
    send();
  };
  const attachBtnEl = $("#attachBtn");
  if (attachBtnEl) attachBtnEl.onclick = () => fileInput.click();
  webSearch.onchange = () => { updateMode(); save(); };
  imageMode.onchange = () => { updateMode(); save(); };
  modelSel.onchange = () => save();

  $("#newChat").onclick = () => {
    if (state.busy && state.controller) state.controller.abort();
    state.messages = [];
    state.attachments = [];
    renderAttachments();
    renderAll();
    save();
    updateTitle();
    closeSidebar();
  };
  $("#clearChat").onclick = () => { $("#newChat").onclick(); };

  $("#downloadChat").onclick = () => {
    if (!state.messages.length) return;
    let out = "# Buffy AI — ប្រវត្តិការសន្ទនា\n\n";
    state.messages.forEach((m) => {
      out += (m.role === "user" ? "## 🧑 អ្នក\n\n" : "## ✦ Buffy AI\n\n") + (m.text || "") + "\n\n";
      if (m.sources && m.sources.length) {
        out += m.sources.map((s) => "- [" + s.title + "](" + s.url + ")").join("\n") + "\n\n";
      }
    });
    const blob = new Blob([out], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "buffy-ai-chat.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  /* mobile sidebar */
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }
  $("#menuBtn").onclick = () => { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); };
  $("#scrim").onclick = closeSidebar;

  /* boot */
  load();
  bindChips(document);
  updateMode();
  renderAll();
  updateTitle();
  autoGrow();
  input.focus();
})();
</script>
</body>
</html>
"""
