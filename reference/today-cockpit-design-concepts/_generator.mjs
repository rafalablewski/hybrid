import { writeFileSync } from 'node:fs';

const OUT = '/home/user/hybrid/reference/today-cockpit-design-concepts';

/* ------------------------------------------------------------------ *
 * SHARED CONTENT  — identical real data across all 10 concepts.
 * Pulled from apps/web today.tsx + cockpit.tsx and the reference spec.
 * ------------------------------------------------------------------ */
const ex = [
  ['Back Squat', '5×3 · RPE 8'],
  ['Romanian Deadlift', '3×8 · RPE 7'],
  ['Zone 2 Bike', '30:00'],
];
const weekStats = [
  ['3', 'Sessions'], ['4,250kg', 'Volume'], ['42', 'Sets'], ['8.4km', 'Distance'],
];
const enduranceStats = [['12', 'efforts'], ['86', 'km'], ['412', 'min']];
const spark = [44, 52, 48, 60, 57, 63, 59, 66, 62, 70, 67, 73, 69, 71];

const svgBell =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

/* ---------- component fragments (themes restyle via CSS) ---------- */
const ring = (val) => `
  <div class="ring" style="--p:${val}">
    <div class="ring-hole"><b>${val}</b></div>
  </div>`;

const sparkline = (arr) => {
  const max = Math.max(...arr);
  return `<div class="spark">${arr
    .map((v, i) => `<i style="height:${Math.round((v / max) * 100)}%" class="${i === arr.length - 1 ? 'on' : ''}"></i>`)
    .join('')}</div>`;
};

const statGrid = (rows, cls = '') => `
  <div class="stats ${cls}">
    ${rows.map(([n, l]) => `<div class="stat"><div class="num">${n}</div><div class="lab">${l}</div></div>`).join('')}
  </div>`;

function todayScreen() {
  return `
  <div class="screen" data-screen="today">
    <header class="appbar">
      <div class="avatar">RA<span class="dot"></span></div>
      <div class="wm">HYBRID<span class="acc">.</span></div>
      <button class="bell">${svgBell}<span class="badge">3</span></button>
    </header>

    <div class="greet">
      <div class="hello">Good morning, Rafal</div>
      <div class="date">Friday, June 27</div>
      <span class="streak">12-day streak</span>
    </div>

    <div class="card plan">
      <div class="card-top">
        <span class="kicker">Train · today's session</span>
        <div class="card-top-r">
          ${ring(78)}
          <button class="btn">Start →</button>
        </div>
      </div>
      <h2 class="title">Lower Power + Zone 2</h2>
      <div class="meta">Push · Day 3/5 · Build wk 4/12</div>
      <div class="exlist">
        ${ex.map(([n, m]) => `<div class="ex"><span class="exname">${n}</span><span class="exmeta">${m}</span></div>`).join('')}
      </div>
    </div>

    <div class="card coach">
      <span class="kicker k2">AI coach</span>
      <h3 class="subtitle">Ask your coach</h3>
      <p class="blurb">Reads your real readiness, fatigue and velocity, then writes today's call — what to push, what to hold back.</p>
      <button class="btn ghost">Open coach →</button>
    </div>

    <div class="duo">
      <div class="card widget">
        <span class="kicker">Daily check-in</span>
        <div class="w-line">How do you feel today?</div>
        <button class="btn sm">Check in</button>
      </div>
      <div class="card widget">
        <span class="kicker">Nutrition</span>
        <div class="kcal"><b>1,847</b><span> / 2,200 kcal</span></div>
        <div class="bar"><i style="width:84%"></i></div>
        <div class="macros">P 156 · C 187 · F 61</div>
      </div>
    </div>

    <div class="card week">
      <div class="card-top">
        <span class="kicker">Plan · this week</span>
        <span class="pr">2 PR</span>
      </div>
      ${statGrid(weekStats, 'wk')}
    </div>
  </div>`;
}

function cockpitScreen() {
  return `
  <div class="screen" data-screen="cockpit">
    <div class="cpt-head">
      <h1 class="cpt-title">Your command center</h1>
      <p class="cpt-sub">Goal → season → today → performance → technique, in one place.</p>
    </div>

    <div class="card section">
      <div class="card-top"><span class="kicker k2">Goal &amp; season</span><button class="link">Periodize →</button></div>
      <div class="sec-big">Hybrid strength-endurance</div>
      <div class="meta">Build · week 5/16 · event in 11 wk</div>
      <div class="barseg"><i style="flex:4" class="t1"></i><i style="flex:6" class="t2 cur"></i><i style="flex:4" class="t1"></i><i style="flex:2" class="t1"></i></div>
      <div class="meta sm">Base · Build · Peak · Taper</div>
    </div>

    <div class="card section perf">
      <div class="card-top"><span class="kicker">Performance state · Athlete Twin</span><button class="link">Performance →</button></div>
      <div class="hpi-row">
        <div class="hpi"><span class="hpi-n">71</span><span class="hpi-l">HPI</span></div>
        ${sparkline(spark)}
      </div>
      <div class="comp">
        <div class="c"><span class="cl">STR</span><span class="cv up">78</span></div>
        <div class="c"><span class="cl">END</span><span class="cv">61</span></div>
        <div class="c"><span class="cl">REC</span><span class="cv up">+73</span></div>
      </div>
      <p class="blurb">Squat e1RM up 6% over 4 weeks — endurance is the limiter.</p>
    </div>

    <div class="card section risk">
      <div class="card-top"><span class="kicker">Injury risk · by tissue</span></div>
      <div class="risk-row">
        <span class="risk-pill">Moderate</span>
        <div class="bar"><i style="width:41%"></i></div>
        <span class="risk-n">41/100</span>
      </div>
      <div class="meta">Patellar tendon · load spike · overall 22/100 (low)</div>
    </div>

    <div class="card section">
      <div class="card-top"><span class="kicker">Your week</span><span class="pr">2 PR</span></div>
      ${statGrid(weekStats, 'wk')}
      <div class="meta sm">Squat 180kg (+5) · Bench 115kg · Deadlift 220kg</div>
    </div>

    <div class="card section">
      <div class="card-top"><span class="kicker k2">Sport S&amp;C</span><button class="link">Sport →</button></div>
      <div class="sec-big sm">Sprint / 100m · Regional</div>
    </div>

    <div class="card section">
      <div class="card-top"><span class="kicker">Endurance</span><button class="link">Running →</button></div>
      ${statGrid(enduranceStats, 'end')}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * BASE CSS — layout skeleton. Themes supply palette vars + overrides.
 * Everything visual references CSS variables so themes restyle freely.
 * ------------------------------------------------------------------ */
const BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{background:var(--page);color:var(--text);font-family:var(--body);line-height:1.5;padding:48px 24px 80px}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto}

/* page header / rationale */
.crumb{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
.crumb a{text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:2px}
.ph-tag{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.ph-title{font-family:var(--display);font-size:clamp(34px,6vw,64px);line-height:1;letter-spacing:var(--display-tracking,-.02em);font-weight:var(--display-weight,800);margin-bottom:14px}
.ph-lede{max-width:680px;color:var(--muted);font-size:17px}
.rationale{display:flex;flex-wrap:wrap;gap:32px;margin:34px 0 46px;padding:26px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.swatches{display:flex;gap:10px;flex-wrap:wrap}
.sw{width:54px}
.sw i{display:block;height:54px;border-radius:8px;border:1px solid var(--line)}
.sw span{font-family:var(--mono);font-size:9px;letter-spacing:.05em;color:var(--muted);display:block;margin-top:6px}
.principles{flex:1;min-width:280px}
.principles h4{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.principles ul{list-style:none;display:grid;gap:8px}
.principles li{font-size:14px;padding-left:18px;position:relative;color:var(--text)}
.principles li::before{content:"";position:absolute;left:0;top:9px;width:6px;height:6px;background:var(--accent);border-radius:50%}
.type-spec{font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.9}
.type-spec b{color:var(--text);font-family:var(--display);font-weight:600}

/* stage + devices */
.stage{display:flex;gap:48px;flex-wrap:wrap;justify-content:center;align-items:flex-start}
.device{width:392px;max-width:100%}
.scr-cap{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);text-align:center;margin-bottom:14px}
.screen{background:var(--screen);border:var(--frame);border-radius:var(--r-screen);padding:var(--screen-pad,20px);box-shadow:var(--screen-shadow);overflow:hidden}
.screen+.screen{margin-top:0}

/* appbar */
.appbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.avatar{position:relative;width:38px;height:38px;border-radius:var(--r-avatar,11px);background:var(--surface2);display:grid;place-items:center;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--text);border:1px solid var(--line)}
.avatar .dot{position:absolute;right:-2px;bottom:-2px;width:9px;height:9px;border-radius:50%;background:var(--accent);border:2px solid var(--screen)}
.wm{font-family:var(--display);font-weight:800;letter-spacing:var(--wm-tracking,-.01em);font-size:17px}
.wm .acc{color:var(--accent)}
.bell{position:relative;width:38px;height:38px;border-radius:var(--r-avatar,11px);background:var(--surface2);border:1px solid var(--line);color:var(--text);display:grid;place-items:center;cursor:pointer}
.bell .badge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--accent);color:var(--accent-ink);font-family:var(--mono);font-size:10px;font-weight:700;display:grid;place-items:center;border:2px solid var(--screen)}

/* greeting */
.greet{margin-bottom:20px}
.hello{font-family:var(--display);font-size:24px;font-weight:var(--head-weight,700);letter-spacing:var(--display-tracking,-.02em);margin-bottom:2px}
.date{color:var(--muted);font-size:13px;margin-bottom:12px}
.streak{display:inline-block;font-family:var(--mono);font-size:11px;letter-spacing:.04em;padding:5px 11px;border-radius:999px;background:var(--accent-soft);color:var(--accent-text);border:1px solid var(--accent-line)}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-card);padding:var(--card-pad,17px);margin-bottom:13px;box-shadow:var(--card-shadow,none)}
.card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.card-top-r{display:flex;align-items:center;gap:12px}
.kicker{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.kicker.k2{color:var(--accent-text)}
.title{font-family:var(--display);font-size:22px;font-weight:var(--head-weight,800);letter-spacing:var(--display-tracking,-.02em);margin-bottom:4px}
.subtitle{font-family:var(--display);font-size:18px;font-weight:var(--head-weight,700);margin:8px 0 6px}
.meta{font-family:var(--mono);font-size:11.5px;color:var(--accent-text);letter-spacing:.02em}
.meta.sm{color:var(--muted);font-size:10.5px;margin-top:8px}
.blurb{color:var(--muted);font-size:13px;line-height:1.55;margin:6px 0 14px}

/* buttons */
.btn{font-family:var(--body);font-weight:600;font-size:13px;border:none;cursor:pointer;padding:9px 15px;border-radius:var(--r-btn,12px);background:var(--accent);color:var(--accent-ink);white-space:nowrap}
.btn.ghost{background:transparent;border:1px solid var(--accent-line);color:var(--accent-text)}
.btn.sm{padding:7px 13px;font-size:12px;margin-top:10px}
.link{font-family:var(--mono);font-size:11px;letter-spacing:.05em;background:none;border:none;color:var(--accent-text);cursor:pointer}

/* readiness ring */
.ring{width:54px;height:54px;border-radius:50%;background:conic-gradient(var(--accent) calc(var(--p)*1%),var(--ring-track) 0);display:grid;place-items:center;flex:0 0 auto}
.ring-hole{width:42px;height:42px;border-radius:50%;background:var(--card);display:grid;place-items:center}
.ring-hole b{font-family:var(--mono);font-size:14px;font-weight:700;color:var(--text)}

/* exercise list */
.exlist{margin-top:14px}
.ex{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-top:1px solid var(--line)}
.exname{font-weight:600;font-size:14px}
.exmeta{font-family:var(--mono);font-size:11.5px;color:var(--muted)}

/* duo widgets */
.duo{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.duo .card{margin-bottom:13px}
.w-line{font-size:14px;margin:12px 0 4px}
.kcal{margin:10px 0 8px}
.kcal b{font-family:var(--display);font-size:22px;font-weight:700}
.kcal span{font-family:var(--mono);font-size:11px;color:var(--muted)}
.bar{height:6px;border-radius:999px;background:var(--surface2);overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent);border-radius:999px}
.macros{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:8px}

/* stats grid */
.stats{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r-field,12px);overflow:hidden;margin-top:4px}
.stats.wk{grid-template-columns:repeat(4,1fr)}
.stats.end{grid-template-columns:repeat(3,1fr)}
.stat{background:var(--card);padding:13px 8px;text-align:center}
.stat .num{font-family:var(--display);font-size:18px;font-weight:700;letter-spacing:-.02em}
.stat .lab{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:4px}
.pr{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent-text);border:1px solid var(--accent-line)}

/* cockpit */
.cpt-head{margin-bottom:20px}
.cpt-title{font-family:var(--display);font-size:26px;font-weight:var(--head-weight,800);letter-spacing:var(--display-tracking,-.02em)}
.cpt-sub{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:6px;line-height:1.7}
.sec-big{font-family:var(--display);font-size:19px;font-weight:700;letter-spacing:-.01em;margin:4px 0 4px}
.sec-big.sm{font-size:15px}
.barseg{display:flex;gap:3px;height:7px;margin:12px 0 6px}
.barseg i{border-radius:3px}
.barseg .t1{background:var(--surface2)}
.barseg .t2{background:var(--accent)}
.hpi-row{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:8px 0 14px}
.hpi{display:flex;align-items:baseline;gap:7px}
.hpi-n{font-family:var(--display);font-size:42px;font-weight:800;letter-spacing:-.03em;line-height:.9;color:var(--accent-text)}
.hpi-l{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--muted)}
.spark{display:flex;align-items:flex-end;gap:3px;height:40px;flex:1;max-width:170px}
.spark i{flex:1;background:var(--surface2);border-radius:2px 2px 0 0;min-height:3px}
.spark i.on{background:var(--accent)}
.comp{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.comp .c{display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:var(--surface2);border-radius:var(--r-field,10px)}
.comp .cl{font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:var(--muted)}
.comp .cv{font-family:var(--display);font-size:18px;font-weight:700}
.comp .cv.up{color:var(--accent-text)}
.risk-row{display:flex;align-items:center;gap:10px;margin:10px 0}
.risk-pill{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;border-radius:6px;background:var(--warn-soft);color:var(--warn);border:1px solid var(--warn-line)}
.risk-row .bar{flex:1}
.risk-row .bar i{background:var(--warn)}
.risk-n{font-family:var(--mono);font-size:11px;color:var(--muted)}
.perf .blurb{margin-bottom:0}

@media(max-width:560px){.screen{padding:16px}.device{width:100%}}
`;

/* ------------------------------------------------------------------ *
 * THEMES
 * ------------------------------------------------------------------ */
const themes = [
  /* 1 — CUPERTINO ------------------------------------------------- */
  {
    id: '01-cupertino',
    name: 'Cupertino',
    inspiration: 'Apple · iOS / visionOS',
    lede: 'Light, calm, and almost invisible. Soft grey canvas, one true blue, deep corner radii and air between every element. The interface recedes; the content is the design.',
    fonts: 'family=Inter:wght@400;500;600;700;800',
    principles: ['Single system blue — no second accent', 'Generous 16–20px whitespace rhythm', 'Soft elevation, never hard borders', 'Numbers in the body font, not mono-everywhere'],
    typeNote: '<b>Inter</b> Display / Text<br>SF-style geometric humanist',
    vars: {
      page: '#f5f5f7', screen: '#ffffff', card: '#ffffff', surface2: '#f0f0f3',
      line: '#e6e6ea', text: '#1d1d1f', muted: '#86868b',
      accent: '#0a84ff', 'accent-ink': '#ffffff', 'accent-text': '#0a6fdb',
      'accent-soft': '#eaf3ff', 'accent-line': '#d6e6fb', 'ring-track': '#ececf0',
      warn: '#d98324', 'warn-soft': '#fdf2e3', 'warn-line': '#f3ddbc',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '40px', 'r-card': '22px', 'r-btn': '999px', 'r-field': '16px', 'r-avatar': '999px',
      frame: '1px solid #ececf0', 'screen-shadow': '0 30px 70px -30px rgba(0,0,0,.22)',
      'card-shadow': '0 1px 2px rgba(0,0,0,.04)', 'screen-pad': '22px',
      'head-weight': '700', 'display-tracking': '-.022em',
    },
    css: `.kicker{font-weight:600}.streak{font-weight:600}.exname{font-weight:500}`,
  },

  /* 2 — LUCID ----------------------------------------------------- */
  {
    id: '02-lucid',
    name: 'Lucid',
    inspiration: 'Lucid Motors · luxury EV',
    lede: 'Airy, expensive, weightless. A near-white canvas washed with the faintest cool gradient, hairline strokes, a muted desaturated teal, and type set light and wide. Restraint as luxury.',
    fonts: 'family=Manrope:wght@300;400;500;600;700;800',
    principles: ['Desaturated single accent — quiet, never loud', 'Hairlines and light weights carry hierarchy', 'Soft gradient ground for depth without color', 'Wide letter-spacing on labels for a luxe register'],
    typeNote: '<b>Manrope</b><br>low-contrast geometric, light weights',
    vars: {
      page: 'linear-gradient(180deg,#fbfcfc 0%,#eef2f3 100%)', screen: '#ffffff', card: '#ffffff',
      surface2: '#f3f6f6', line: '#e7ecec', text: '#21282b', muted: '#8b979a',
      accent: '#5a8a90', 'accent-ink': '#ffffff', 'accent-text': '#3f6e73',
      'accent-soft': '#eef4f4', 'accent-line': '#dde9e9', 'ring-track': '#edf1f1',
      warn: '#b08454', 'warn-soft': '#f6efe7', 'warn-line': '#ecdcc9',
      display: "'Manrope',sans-serif", body: "'Manrope',sans-serif", mono: "'Manrope',sans-serif",
      'r-screen': '34px', 'r-card': '20px', 'r-btn': '999px', 'r-field': '16px', 'r-avatar': '999px',
      frame: '1px solid #e7ecec', 'screen-shadow': '0 40px 90px -40px rgba(40,60,65,.28)',
      'card-shadow': '0 1px 30px -18px rgba(40,60,65,.25)', 'screen-pad': '24px',
      'head-weight': '600', 'display-tracking': '-.015em', 'display-weight': '700',
    },
    css: `.kicker{letter-spacing:.24em;font-weight:600}.hello{font-weight:600}.ph-title{font-weight:700}
    .card{box-shadow:0 1px 30px -22px rgba(40,60,65,.4)}.btn{font-weight:600}.wm{font-weight:700}`,
  },

  /* 3 — TESLA ----------------------------------------------------- */
  {
    id: '03-tesla',
    name: 'Apex',
    inspiration: 'Tesla · industrial UI',
    lede: 'High-contrast, geometric, engineered. Crisp white, near-black ink, and a single signal red used like a warning light — sparingly, only where it means something. Tight grid, sharp corners.',
    fonts: 'family=Inter:wght@400;500;600;700;800;900',
    principles: ['One signal red, reserved for action & alert only', 'Sharp 6px corners — mechanical, not soft', 'Wide-tracked uppercase labels', 'Strict alignment; everything on the grid'],
    typeNote: '<b>Inter</b> tight<br>uppercase tracking on labels',
    vars: {
      page: '#fafafa', screen: '#ffffff', card: '#ffffff', surface2: '#f2f2f2',
      line: '#e2e2e2', text: '#111111', muted: '#8a8a8a',
      accent: '#e31937', 'accent-ink': '#ffffff', 'accent-text': '#c01530',
      'accent-soft': '#fdeef0', 'accent-line': '#f6d4d9', 'ring-track': '#ededed',
      warn: '#111111', 'warn-soft': '#f2f2f2', 'warn-line': '#e2e2e2',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '14px', 'r-card': '8px', 'r-btn': '6px', 'r-field': '6px', 'r-avatar': '6px',
      frame: '1px solid #111111', 'screen-shadow': '0 30px 60px -30px rgba(0,0,0,.25)',
      'card-shadow': 'none', 'screen-pad': '20px',
      'head-weight': '800', 'display-tracking': '-.03em', 'display-weight': '800',
    },
    css: `.kicker{letter-spacing:.22em;font-weight:700;color:var(--text)}
    .wm{text-transform:uppercase;letter-spacing:.08em}.title{text-transform:uppercase;letter-spacing:-.01em}
    .hello{text-transform:uppercase;letter-spacing:.01em;font-weight:800}
    .card{border-width:1px}.btn{text-transform:uppercase;letter-spacing:.08em;font-weight:700;font-size:12px}
    .scr-cap{color:var(--text);font-weight:700}.streak{text-transform:uppercase;letter-spacing:.1em;font-weight:700}
    .pr{background:var(--text);color:#fff;border-color:var(--text)}.risk-pill{background:var(--text);color:#fff;border-color:var(--text)}`,
  },

  /* 4 — JAPANDI ---------------------------------------------------- */
  {
    id: '04-japandi',
    name: 'Japandi',
    inspiration: 'Japandi · warm minimal',
    lede: 'Quiet, warm, and tactile. Oat-paper grounds, muted clay accent, a sage secondary, and a serif display that brings a human, editorial calm. Negative space treated as a material.',
    fonts: 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600',
    principles: ['Earthy, low-chroma palette — clay & sage', 'Serif display against clean sans body', 'Warm paper tones, never pure white', 'Soft radii, soft shadows, soft contrast'],
    typeNote: '<b>Fraunces</b> display · <b>Inter</b> text<br>serif warmth, humanist body',
    vars: {
      page: '#efe9df', screen: '#f8f4ec', card: '#fcfaf4', surface2: '#efe8db',
      line: '#e2d9c9', text: '#3a352c', muted: '#9b9384',
      accent: '#b06a4f', 'accent-ink': '#fcfaf4', 'accent-text': '#9a5840',
      'accent-soft': '#f3e7df', 'accent-line': '#e7d3c7', 'ring-track': '#e7ddcd',
      warn: '#a98344', 'warn-soft': '#f3ebda', 'warn-line': '#e6d6b9',
      display: "'Fraunces',serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '30px', 'r-card': '18px', 'r-btn': '999px', 'r-field': '14px', 'r-avatar': '14px',
      frame: '1px solid #e2d9c9', 'screen-shadow': '0 36px 80px -38px rgba(80,68,50,.3)',
      'card-shadow': 'none', 'screen-pad': '22px',
      'head-weight': '500', 'display-tracking': '-.01em', 'display-weight': '500',
    },
    css: `.kicker{letter-spacing:.2em}.title,.hello,.cpt-title,.sec-big,.subtitle,.hpi-n,.stat .num,.kcal b{font-family:var(--display);font-weight:500}
    .ph-title{font-weight:500}.wm{font-family:var(--display);font-weight:600;letter-spacing:0}
    .meta{color:var(--accent-text)}.streak{font-family:var(--mono)}`,
  },

  /* 5 — SWISS ----------------------------------------------------- */
  {
    id: '05-swiss',
    name: 'Grid',
    inspiration: 'Swiss / International Typographic',
    lede: 'The discipline of the grid. Black on white, one red, flush-left type, and ruled hairlines doing all the work. No cards, no shadows, no decoration — only hierarchy, alignment and space.',
    fonts: 'family=Inter:wght@400;500;600;700;800',
    principles: ['No cards — sections divided by rules alone', 'Flush-left, ragged-right, tight leading', 'Black + white + one red, nothing else', 'Baseline alignment and a visible column grid'],
    typeNote: '<b>Inter</b> as Helvetica<br>flush-left, tight tracking',
    vars: {
      page: '#ffffff', screen: '#ffffff', card: '#ffffff', surface2: '#f4f4f4',
      line: '#111111', text: '#111111', muted: '#7a7a7a',
      accent: '#e2001a', 'accent-ink': '#ffffff', 'accent-text': '#e2001a',
      'accent-soft': '#ffffff', 'accent-line': '#111111', 'ring-track': '#e6e6e6',
      warn: '#e2001a', 'warn-soft': '#ffffff', 'warn-line': '#111111',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '0px', 'r-card': '0px', 'r-btn': '0px', 'r-field': '0px', 'r-avatar': '0px',
      frame: '1.5px solid #111111', 'screen-shadow': 'none', 'card-shadow': 'none',
      'screen-pad': '0px', 'head-weight': '800', 'display-tracking': '-.03em', 'display-weight': '800',
    },
    css: `.screen{padding:0}
    .appbar{padding:18px 20px;border-bottom:1.5px solid var(--line);margin-bottom:0}
    .greet,.card,.cpt-head{padding:18px 20px;margin:0;border:none;border-bottom:1px solid var(--line)}
    .card{border-radius:0}.duo{grid-template-columns:1fr 1fr;gap:0}
    .duo .card{margin:0;border-bottom:1px solid var(--line)}.duo .card:first-child{border-right:1px solid var(--line)}
    .kicker{letter-spacing:.12em;color:var(--text);font-weight:700}
    .avatar,.bell{border-radius:0;border-width:1.5px}.streak{border-radius:0;background:#fff;border:1.5px solid var(--line);color:var(--text);font-weight:700}
    .btn{border-radius:0;font-weight:700}.btn.ghost{border-width:1.5px}.pr{border-radius:0;background:var(--accent);color:#fff;border-color:var(--accent)}
    .stats{border-radius:0;gap:1.5px;background:var(--line);border-color:var(--line)}
    .hpi-n,.title,.hello{letter-spacing:-.04em}.ring{border:1.5px solid var(--line)}.ring-hole{background:#fff}
    .risk-pill{border-radius:0;background:var(--accent);color:#fff;border-color:var(--accent)}
    .comp .c{border-radius:0;background:#fff;border:1px solid var(--line)}.bar{border-radius:0}.bar i{border-radius:0}
    .scr-cap{color:var(--text);font-weight:700}.barseg i{border-radius:0}`,
  },

  /* 6 — NORDIC ----------------------------------------------------- */
  {
    id: '06-nordic',
    name: 'Fjord',
    inspiration: 'Nordic · functional calm',
    lede: 'Cool, clean, and unhurried. A soft fog-grey canvas, white surfaces, a single muted slate-blue, and plenty of breathing room. Functional minimalism with a calm Scandinavian temperature.',
    fonts: 'family=Inter:wght@400;500;600;700',
    principles: ['Cool grey ground, one muted slate-blue', 'Low contrast, soft elevation, rounded calm', 'Functional clarity over expression', 'Restful spacing — nothing crowds'],
    typeNote: '<b>Inter</b><br>medium weights, easy contrast',
    vars: {
      page: '#e9edf0', screen: '#ffffff', card: '#ffffff', surface2: '#eef2f5',
      line: '#e0e6ea', text: '#2b333a', muted: '#8b96a0',
      accent: '#5a7184', 'accent-ink': '#ffffff', 'accent-text': '#4a606f',
      'accent-soft': '#eef2f5', 'accent-line': '#dce4ea', 'ring-track': '#e9eef2',
      warn: '#b07c5a', 'warn-soft': '#f4ece6', 'warn-line': '#e8d8cb',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '32px', 'r-card': '20px', 'r-btn': '14px', 'r-field': '14px', 'r-avatar': '12px',
      frame: '1px solid #e0e6ea', 'screen-shadow': '0 34px 80px -40px rgba(43,51,58,.32)',
      'card-shadow': '0 1px 2px rgba(43,51,58,.04)', 'screen-pad': '22px',
      'head-weight': '600', 'display-tracking': '-.018em', 'display-weight': '700',
    },
    css: `.kicker{letter-spacing:.18em}.hello{font-weight:600}`,
  },

  /* 7 — ONYX (refined dark) --------------------------------------- */
  {
    id: '07-onyx',
    name: 'Onyx',
    inspiration: 'Premium dark · brushed brass',
    lede: 'Dark done with discipline. A true neutral charcoal ramp — not a rainbow — lit by a single warm brass accent. This is how to keep a dark interface premium: one metal, many greys, real hierarchy.',
    fonts: 'family=Inter:wght@400;500;600;700;800',
    principles: ['Neutral charcoal ramp + ONE warm brass accent', 'No second hue — grey carries structure', 'Restrained accent: edges, values, CTAs only', 'Soft inner light, deep flat surfaces'],
    typeNote: '<b>Inter</b><br>tight display, mono numerals',
    vars: {
      page: '#0d0d0f', screen: '#0e0e10', card: '#17171a', surface2: '#202024',
      line: '#262629', text: '#ededee', muted: '#8a8a92',
      accent: '#c8a24b', 'accent-ink': '#1a1a1a', 'accent-text': '#d8b765',
      'accent-soft': 'rgba(200,162,75,.12)', 'accent-line': 'rgba(200,162,75,.28)', 'ring-track': '#26262a',
      warn: '#cf7d52', 'warn-soft': 'rgba(207,125,82,.12)', 'warn-line': 'rgba(207,125,82,.3)',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'JetBrains Mono',monospace",
      'r-screen': '36px', 'r-card': '20px', 'r-btn': '12px', 'r-field': '12px', 'r-avatar': '12px',
      frame: '1px solid #1f1f22', 'screen-shadow': '0 40px 90px -40px rgba(0,0,0,.7)',
      'card-shadow': 'inset 0 1px 0 rgba(255,255,255,.03)', 'screen-pad': '22px',
      'head-weight': '700', 'display-tracking': '-.022em', 'display-weight': '800',
    },
    extraFonts: 'family=JetBrains+Mono:wght@400;500;600;700',
    css: `.kicker{color:var(--muted)}`,
  },

  /* 8 — EDITORIAL ------------------------------------------------- */
  {
    id: '08-editorial',
    name: 'Editorial',
    inspiration: 'Print magazine · type-led',
    lede: 'A page, not a screen. Warm cream stock, a high-contrast serif display, an oxblood accent, and ruled dividers. Hierarchy comes from scale and a confident masthead — like a well-set spread.',
    fonts: 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600',
    principles: ['Serif display at large scale as the hero', 'Cream stock + ink + one oxblood', 'Ruled hairlines instead of boxes', 'Editorial restraint — type does the talking'],
    typeNote: '<b>Fraunces</b> display · <b>Inter</b> text<br>high-contrast serif masthead',
    vars: {
      page: '#f3efe6', screen: '#faf7f0', card: '#faf7f0', surface2: '#efe9dc',
      line: '#ddd5c4', text: '#211d18', muted: '#928a79',
      accent: '#7a2e2e', 'accent-ink': '#faf7f0', 'accent-text': '#7a2e2e',
      'accent-soft': '#f1e6e0', 'accent-line': '#e3cfc8', 'ring-track': '#e7ddcb',
      warn: '#8a6a2a', 'warn-soft': '#f0e9d6', 'warn-line': '#e2d4ac',
      display: "'Fraunces',serif", body: "'Inter',sans-serif", mono: "'Inter',sans-serif",
      'r-screen': '6px', 'r-card': '0px', 'r-btn': '0px', 'r-field': '4px', 'r-avatar': '0px',
      frame: '1px solid #ddd5c4', 'screen-shadow': '0 34px 80px -40px rgba(60,50,35,.34)',
      'card-shadow': 'none', 'screen-pad': '24px',
      'head-weight': '600', 'display-tracking': '-.01em', 'display-weight': '600',
    },
    css: `.card{border:none;border-top:1px solid var(--line);border-radius:0;padding:16px 0;margin-bottom:0}
    .card:first-of-type{border-top:none}.duo{gap:14px}.duo .card{border-top:1px solid var(--line);padding-top:14px}
    .title,.hello,.cpt-title,.sec-big,.subtitle,.hpi-n,.stat .num,.kcal b,.ph-title{font-family:var(--display)}
    .title{font-size:26px}.hello{font-size:28px;font-weight:600}.wm{font-family:var(--display);font-weight:600;letter-spacing:0}
    .kicker{letter-spacing:.16em}.avatar,.bell{border-radius:0}.appbar{border-bottom:2px solid var(--text);padding-bottom:14px}
    .stats{border:none;background:transparent;gap:0;border-top:1px solid var(--line)}.stat{border-right:1px solid var(--line);background:transparent}
    .stat:last-child{border-right:none}.streak{border-radius:0;background:transparent;border:1px solid var(--accent-line);color:var(--accent-text)}
    .btn{border-radius:0}.pr{border-radius:0;background:transparent;border:1px solid var(--accent);color:var(--accent)}
    .ph-title{font-style:italic}`,
  },

  /* 9 — CARBON / TERMINAL ----------------------------------------- */
  {
    id: '09-carbon',
    name: 'Carbon',
    inspiration: 'Bloomberg · tasteful terminal',
    lede: 'Dense and instrumented — but disciplined. Charcoal panels, monospaced data, hairline grids, and ONE cyan reserved for live values. The Bloomberg energy your spec wants, without the rainbow.',
    fonts: 'family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700',
    principles: ['Mono-led numerics, dense information rhythm', 'Greyscale UI + ONE cyan for live data only', 'Hairline gridlines, square panels', 'Compact spacing — built to be read fast'],
    typeNote: '<b>IBM Plex Mono</b> data · <b>Inter</b> labels',
    vars: {
      page: '#0b0c0d', screen: '#101214', card: '#16191c', surface2: '#1d2125',
      line: '#23282c', text: '#dfe4e8', muted: '#7c858d',
      accent: '#3fb6c9', 'accent-ink': '#04181c', 'accent-text': '#5fcfe0',
      'accent-soft': 'rgba(63,182,201,.1)', 'accent-line': 'rgba(63,182,201,.26)', 'ring-track': '#23282c',
      warn: '#d99a3f', 'warn-soft': 'rgba(217,154,63,.12)', 'warn-line': 'rgba(217,154,63,.3)',
      display: "'Inter',sans-serif", body: "'Inter',sans-serif", mono: "'IBM Plex Mono',monospace",
      'r-screen': '10px', 'r-card': '6px', 'r-btn': '4px', 'r-field': '4px', 'r-avatar': '4px',
      frame: '1px solid #23282c', 'screen-shadow': '0 40px 90px -45px rgba(0,0,0,.75)',
      'card-shadow': 'none', 'screen-pad': '16px',
      'head-weight': '700', 'display-tracking': '-.02em', 'display-weight': '700',
    },
    css: `.card{padding:14px;margin-bottom:8px}.kicker{letter-spacing:.14em;font-size:9.5px}
    .hpi-n,.stat .num,.title,.sec-big,.kcal b{font-family:var(--mono);font-weight:600}
    .hpi-n{letter-spacing:0}.meta{font-size:11px}.scr-cap{color:var(--accent-text)}
    .avatar,.bell{border-radius:4px}.stats{gap:1px}.comp .c{border-radius:4px}
    .wm{letter-spacing:.04em}.duo{gap:8px}.duo .card{margin-bottom:8px}`,
  },

  /* 10 — AURORA DISCIPLINED --------------------------------------- */
  {
    id: '10-aurora-refined',
    name: 'Aurora — disciplined',
    inspiration: 'Your brand, fixed',
    lede: 'Your existing lime, but as the ONLY accent. The slop wasn’t the lime — it was lime + blue + violet + amber + red competing at once. Here: a true neutral charcoal ramp, lime for energy, and red kept strictly for risk. Same brand, finally consistent.',
    fonts: 'family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700',
    principles: ['ONE accent (lime) — blue/violet/amber retired as decoration', 'Red kept strictly semantic: injury & risk only', 'Neutral charcoal ramp carries all structure', 'Archivo + JetBrains Mono, your real type stack'],
    typeNote: '<b>Archivo</b> display · <b>JetBrains Mono</b><br>your shipped type stack',
    vars: {
      page: '#0a0b0a', screen: '#0c0d0c', card: '#151715', surface2: '#1d201d',
      line: '#242724', text: '#f3f4ef', muted: '#8b8f86',
      accent: '#c4f035', 'accent-ink': '#0c0d0c', 'accent-text': '#c4f035',
      'accent-soft': 'rgba(196,240,53,.12)', 'accent-line': 'rgba(196,240,53,.3)', 'ring-track': '#242724',
      warn: '#e0625e', 'warn-soft': 'rgba(224,98,94,.12)', 'warn-line': 'rgba(224,98,94,.32)',
      display: "'Archivo',sans-serif", body: "'Archivo',sans-serif", mono: "'JetBrains Mono',monospace",
      'r-screen': '34px', 'r-card': '24px', 'r-btn': '14px', 'r-field': '14px', 'r-avatar': '12px',
      frame: '1px solid #1f211f', 'screen-shadow': '0 40px 90px -40px rgba(0,0,0,.7)',
      'card-shadow': 'none', 'screen-pad': '22px',
      'head-weight': '800', 'display-tracking': '-.02em', 'display-weight': '900',
    },
    css: `.kicker{color:var(--muted)}.hello{font-weight:800}`,
  },
];

/* ------------------------------------------------------------------ *
 * RENDER
 * ------------------------------------------------------------------ */
function varsBlock(v) {
  return Object.entries(v).map(([k, val]) => `--${k}:${val}`).join(';\n  ');
}

function swatchRow(v) {
  const keys = [['page', 'ground'], ['card', 'surface'], ['text', 'ink'], ['muted', 'muted'], ['accent', 'accent'], ['line', 'line']];
  return keys.map(([k, lbl]) => `<div class="sw"><i style="background:${v[k]}"></i><span>${lbl}</span></div>`).join('');
}

function page(t, idx) {
  const fontLinks = [t.fonts, t.extraFonts].filter(Boolean)
    .map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${f}&display=swap">`).join('\n');
  const prev = themes[(idx + themes.length - 1) % themes.length];
  const next = themes[(idx + 1) % themes.length];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${String(idx + 1).padStart(2, '0')} · ${t.name} — HYBRID concept</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks}
<style>
:root{
  ${varsBlock(t.vars)}
}
${BASE}
/* ---- ${t.name} overrides ---- */
${t.css || ''}
</style>
</head>
<body>
<div class="wrap">
  <div class="crumb"><a href="index.html">← all 10 concepts</a> &nbsp;·&nbsp; ${String(idx + 1).padStart(2, '0')} / 10 &nbsp;·&nbsp; <a href="${prev.id}.html">prev</a> / <a href="${next.id}.html">next</a></div>
  <div class="ph-tag">${t.inspiration}</div>
  <h1 class="ph-title">${t.name}</h1>
  <p class="ph-lede">${t.lede}</p>

  <div class="rationale">
    <div>
      <div class="swatches">${swatchRow(t.vars)}</div>
    </div>
    <div class="principles">
      <h4>Design principles</h4>
      <ul>${t.principles.map((p) => `<li>${p}</li>`).join('')}</ul>
    </div>
    <div>
      <h4 style="font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px">Type</h4>
      <div class="type-spec">${t.typeNote}</div>
    </div>
  </div>

  <div class="stage">
    <div class="device">
      <div class="scr-cap">Today</div>
      ${todayScreen()}
    </div>
    <div class="device">
      <div class="scr-cap">Cockpit</div>
      ${cockpitScreen()}
    </div>
  </div>
</div>
</body>
</html>`;
}

/* ---- index ---- */
function indexPage() {
  const cards = themes.map((t, i) => {
    const v = t.vars;
    const bg = v.page.startsWith('linear') ? v.page : v.page;
    return `<a class="ix-card" href="${t.id}.html" style="--c-bg:${bg};--c-card:${v.card};--c-text:${v.text};--c-acc:${v.accent};--c-line:${v.line};--c-muted:${v.muted}">
      <div class="ix-prev">
        <div class="ix-mini" style="background:${v.card};border:1px solid ${v.line}">
          <span class="ix-bar" style="background:${v.accent}"></span>
          <span class="ix-l" style="background:${v.text};opacity:.85"></span>
          <span class="ix-l sm" style="background:${v.muted}"></span>
          <span class="ix-chip" style="background:${v.accent}"></span>
        </div>
      </div>
      <div class="ix-meta">
        <div class="ix-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="ix-name">${t.name}</div>
        <div class="ix-insp">${t.inspiration}</div>
      </div>
    </a>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HYBRID — Today &amp; Cockpit · 10 design concepts</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0c0d0c;color:#f3f4ef;font-family:'Inter',sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;padding:64px 28px 90px}
.wrap{max-width:1180px;margin:0 auto}
a{color:inherit;text-decoration:none}
.tag{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#c4f035;margin-bottom:16px}
h1{font-size:clamp(36px,6vw,68px);line-height:1.02;letter-spacing:-.03em;font-weight:800;margin-bottom:18px}
.lede{max-width:760px;color:#9a9e94;font-size:17px;margin-bottom:14px}
.lede b{color:#f3f4ef;font-weight:600}
.note{max-width:760px;color:#7c7f76;font-size:14px;font-family:'JetBrains Mono',monospace;line-height:1.7;border-left:2px solid #242724;padding-left:16px;margin-bottom:48px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
.ix-card{display:block;text-decoration:none;border:1px solid #242724;border-radius:18px;overflow:hidden;background:#121312;transition:transform .18s ease,border-color .18s ease}
.ix-card:hover{transform:translateY(-4px);border-color:#3a3d3a}
.ix-prev{height:150px;background:var(--c-bg);display:grid;place-items:center;padding:22px}
.ix-mini{width:100%;height:100%;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;position:relative}
.ix-bar{width:44px;height:8px;border-radius:3px}
.ix-l{width:80%;height:7px;border-radius:3px;opacity:.8}
.ix-l.sm{width:55%;opacity:.4}
.ix-chip{position:absolute;right:14px;bottom:14px;width:30px;height:30px;border-radius:8px}
.ix-meta{padding:16px 18px 20px;display:flex;flex-direction:column;gap:3px;border-top:1px solid #242724}
.ix-num{font-family:'JetBrains Mono',monospace;font-size:11px;color:#6e7269;letter-spacing:.1em}
.ix-name{font-size:18px;font-weight:700;letter-spacing:-.01em}
.ix-insp{font-size:12.5px;color:#8b8f86}
.foot{margin-top:54px;padding-top:26px;border-top:1px solid #242724;font-size:13px;color:#7c7f76;max-width:760px;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <div class="tag">HYBRID · design exploration</div>
  <h1>Today &amp; Cockpit —<br>10 ways to kill the slop.</h1>
  <p class="lede">Same real content, ten disciplined design systems. The fix for an "AI-slop" look is never a new color — it's <b>restraint</b>: one accent, a neutral ramp, real typographic hierarchy, and a strict grid.</p>
  <p class="note">Diagnosis — today's UI runs five accent colors at once (lime + blue + violet + amber + red on near-black). That competing-rainbow is the slop. Every concept below collapses to a single accent and lets a neutral ramp + type + grid carry the structure. Concept 10 keeps your exact lime — just disciplined — so you can ship the smallest possible change.</p>
  <div class="grid">${cards}</div>
  <div class="foot">Each tile opens a standalone HTML page showing both Today and Cockpit in that language, with your live data (readiness 78, HPI 71, the Lower Power + Zone 2 session, week stats, injury risk). Pick a direction — or a hybrid of two — and I'll wire the winning tokens into <code>packages/core</code> so web + mobile inherit it.</div>
</div>
</body>
</html>`;
}

/* ---- write ---- */
themes.forEach((t, i) => writeFileSync(`${OUT}/${t.id}.html`, page(t, i)));
writeFileSync(`${OUT}/index.html`, indexPage());
console.log('wrote', themes.length + 1, 'files to', OUT);
