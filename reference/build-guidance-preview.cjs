// One-off generator: renders the @hybrid/core guidance data into a standalone,
// brand-styled HTML preview of the admin Guidance tab (reference/ snapshot).
// Run: node reference/build-guidance-preview.cjs
// Self-contained + cross-platform: compiles guidance.ts into an OS temp dir
// (no hardcoded /tmp) and loads it, so it works on Windows too.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-guidance-"));
execSync(`npx tsc packages/core/src/guidance.ts --outDir "${outDir}" --module commonjs --target es2020 --skipLibCheck`, {
  cwd: root,
  stdio: "inherit",
});
const { GUIDES } = require(path.join(outDir, "guidance.js"));

const C = {
  ink: "#0c0d0c", card: "#161816", line: "#2a2d2a", lime: "#c4f035",
  chalk: "#f3f4ef", ash: "#8b8f86", blue: "#7fd4e8", violet: "#c9a9f0", amber: "#f0b45e",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function block(b) {
  if (b.t === "p") return `<p class="p">${esc(b.text)}</p>`;
  if (b.t === "note") return `<div class="note"><span class="note-k">Note</span>${esc(b.text)}</div>`;
  if (b.t === "term") return `<div class="term"><div class="term-h">${esc(b.term)}</div><div>${esc(b.text)}</div></div>`;
  return `<ol class="steps">${b.items.map((it) => `<li><span class="num"></span><span>${esc(it)}</span></li>`).join("")}</ol>`;
}

function section(s) {
  return `<section class="card" id="sec-${s.id}">
    <div class="sec-h"><span class="sec-ic">${esc(s.icon)}</span><h2>${esc(s.title)}</h2></div>
    ${s.summary ? `<div class="summary">${esc(s.summary)}</div>` : ""}
    <div class="blocks">${s.blocks.map(block).join("")}</div>
  </section>`;
}

function guidePane(g, i) {
  const toc = g.sections.map((s) => `<a class="toc-link" href="#sec-${s.id}"><span class="toc-ic">${esc(s.icon)}</span>${esc(s.title)}</a>`).join("");
  return `<div class="pane" data-pane="${g.id}" ${i === 0 ? "" : 'hidden'}>
    <aside class="toc">
      <div class="toc-title">${esc(g.title)}</div>
      <nav>${toc}</nav>
      <div class="toc-foot">Last reviewed ${esc(g.updated)}</div>
    </aside>
    <div class="sections">${g.sections.map(section).join("")}</div>
  </div>`;
}

const pills = GUIDES.map((g, i) => `<button class="pill ${i === 0 ? "on" : ""}" data-guide="${g.id}">${esc(g.id)}</button>`).join("");

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HYBRID · Admin Guidance (snapshot)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<style>
  :root{
    --ink:${C.ink};--card:${C.card};--line:${C.line};--lime:${C.lime};--chalk:${C.chalk};
    --ash:${C.ash};--blue:${C.blue};--violet:${C.violet};--amber:${C.amber};
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:var(--ink);color:var(--chalk);
    font-family:'Sohne',system-ui,sans-serif;line-height:1.5;
    min-height:100vh;position:relative;overflow-x:hidden;
  }
  /* ambient liquid-glass field */
  .field{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .blob{position:absolute;width:42vmax;height:42vmax;border-radius:50%;filter:blur(70px);opacity:.16;mix-blend-mode:screen;will-change:transform}
  .b1{background:var(--lime);top:-8vmax;left:-6vmax;animation:d1 19s ease-in-out infinite}
  .b2{background:var(--blue);top:8vmax;right:-10vmax;animation:d2 23s ease-in-out infinite}
  .b3{background:var(--violet);bottom:-14vmax;left:34%;animation:d3 27s ease-in-out infinite}
  @keyframes d1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(7vmax,5vmax,0) scale(1.15)}}
  @keyframes d2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-6vmax,6vmax,0) scale(1.1)}}
  @keyframes d3{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-5vmax,-5vmax,0) scale(1.2)}}
  .wrap{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:28px 28px 80px}
  .mono{font-family:'SohneMono',ui-monospace,monospace}
  header.top{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px;flex-wrap:wrap;gap:12px}
  .kick{font-family:'SohneMono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
  h1{font-weight:900;font-size:30px;letter-spacing:-.03em;margin:2px 0 0}
  .chip{font-family:'SohneMono',monospace;font-size:11px;color:var(--ash);border:1px solid var(--line);border-radius:999px;padding:6px 12px}
  /* glass surface */
  .card{
    position:relative;border-radius:16px;background:rgba(22,24,22,.55);
    -webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);
    border:1px solid rgba(255,255,255,.08);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.12), 0 18px 40px -18px rgba(0,0,0,.6);
    padding:20px;
  }
  .pills{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
  .pill{font-family:'SohneMono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;
    padding:7px 13px;border-radius:8px;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--ash)}
  .pill.on{border-color:rgba(240,180,94,.5);background:rgba(240,180,94,.12);color:var(--amber)}
  .pane{display:grid;grid-template-columns:240px 1fr;gap:20px;align-items:start}
  .toc{position:sticky;top:18px;padding:16px}
  .toc{border-radius:16px;background:rgba(22,24,22,.55);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.08)}
  .toc-title{font-family:'SohneMono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--amber);margin-bottom:10px}
  .toc-link{display:flex;gap:9px;align-items:center;padding:8px 10px;border-radius:8px;color:var(--ash);text-decoration:none;font-size:13px;font-weight:600}
  .toc-link:hover{background:rgba(196,240,53,.10);color:var(--lime)}
  .toc-ic{width:16px;text-align:center}
  .toc-foot{font-family:'SohneMono',monospace;font-size:10px;color:var(--ash);margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
  .sections{display:flex;flex-direction:column;gap:16px}
  section.card{scroll-margin-top:18px}
  .sec-h{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .sec-ic{font-size:18px;color:var(--lime)}
  .sec-h h2{font-weight:900;font-size:20px;letter-spacing:-.02em;margin:0}
  .summary{font-family:'SohneMono',monospace;font-size:12px;color:var(--ash);margin-bottom:14px}
  .blocks{display:flex;flex-direction:column;gap:12px}
  .p{font-size:14px;line-height:1.65;margin:0;color:var(--chalk)}
  .note{border-left:3px solid var(--amber);background:rgba(240,180,94,.10);border-radius:8px;padding:10px 14px;font-size:13.5px;line-height:1.6}
  .note-k{display:block;font-family:'SohneMono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--amber);margin-bottom:4px}
  .term{padding-left:14px;border-left:2px solid var(--line);font-size:13.5px;line-height:1.62}
  .term-h{font-weight:800;font-size:14.5px;color:var(--lime);margin-bottom:3px}
  .steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;counter-reset:g}
  .steps li{display:flex;gap:12px;align-items:flex-start;font-size:13.5px;line-height:1.6}
  .num{counter-increment:g;flex:0 0 auto;width:22px;height:22px;border-radius:7px;background:rgba(196,240,53,.12);
    border:1px solid rgba(196,240,53,.33);color:var(--lime);font-family:'SohneMono',monospace;font-size:11px;font-weight:700;
    display:grid;place-items:center;margin-top:1px}
  .num::before{content:counter(g)}
  @media (max-width:820px){.pane{grid-template-columns:1fr}.toc{position:static}}
</style>
</head>
<body>
  <div class="field"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
  <div class="wrap">
    <header class="top">
      <div>
        <div class="kick">admin.hybrid.app — snapshot</div>
        <h1>Guidance</h1>
      </div>
      <div class="chip">Restricted · admin only</div>
    </header>
    <div class="pills">${pills}</div>
    ${GUIDES.map(guidePane).join("")}
  </div>
<script>
  document.querySelectorAll('.pill').forEach(function(p){
    p.addEventListener('click', function(){
      var id = p.dataset.guide;
      document.querySelectorAll('.pill').forEach(function(x){ x.classList.toggle('on', x===p); });
      document.querySelectorAll('.pane').forEach(function(pane){ pane.hidden = (pane.dataset.pane !== id); });
      window.scrollTo({top:0,behavior:'smooth'});
    });
  });
</script>
</body>
</html>`;

const out = path.join(__dirname, "guidance-preview.html");
fs.writeFileSync(out, html);
console.log("wrote", out, `(${(html.length / 1024).toFixed(1)} KB)`);
