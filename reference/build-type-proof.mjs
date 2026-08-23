#!/usr/bin/env node
/**
 * BUILD A TYPE PROOF IN THE REAL FACES — local only, never published.
 *
 * The two type artifacts (reference/typography-system.html and
 * typography-before-after.html) are set in Google Fonts STAND-INS, because a
 * published Artifact is a public URL and Söhne and ITC Garamond are licensed.
 * That is the correct call for anything with a URL, and it has a cost that this
 * script exists to pay off: you cannot judge a PAIRING from a substitute. The
 * sizes, weights, leading and tracking in those pages are exact; the letterforms
 * are somebody else's.
 *
 * This emits the same comparisons with the ACTUAL binaries base64-embedded, so
 * the file opens in any browser with no server and no network and draws real
 * Söhne, real Söhne Mono and real ITC Garamond.
 *
 * ── DO NOT COMMIT OR PUBLISH THE OUTPUT ────────────────────────────────────
 *
 * The output carries the font binaries inside it. Committing it to a public
 * repository or publishing it to an Artifact URL distributes licensed faces —
 * the exact thing `scale.test.ts` already forbids for globals.css ("a public
 * @import cannot serve a licensed face"). The SCRIPT is safe to commit; its
 * output is not. Write it outside the repo:
 *
 *     node reference/build-type-proof.mjs /tmp/type-proof.html
 *
 * ── THE NUMBERS ────────────────────────────────────────────────────────────
 *
 * BEFORE is frozen — it is the ladder and the band table as they stood at git
 * HEAD~2, and it will never change again. AFTER is recomputed here from the
 * three constants that DEFINE the live ladder (`TYPE_REF`, `STEP`, `OPTICAL_K`
 * in packages/core/src/scale.ts) rather than copied from it, so a divergence is
 * a real divergence. `assertMatchesScaleTs()` re-reads scale.ts and fails if the
 * constants here have drifted from the source of truth.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FONTS = join(ROOT, "apps", "mobile", "assets", "fonts");

// ── the faces, as they ship ─────────────────────────────────────────────────
const FACES = [
  ["Sohne", 400, "Sohne-Buch.otf"],
  ["Sohne", 500, "Sohne-Kraftig.otf"],
  ["Sohne", 600, "Sohne-Halbfett.otf"],
  ["Sohne", 700, "Sohne-Dreiviertelfett.otf"],
  ["SohneMono", 400, "SohneMono-Buch.otf"],
  ["SohneMono", 500, "SohneMono-Kraftig.otf"],
  ["SohneMono", 600, "SohneMono-Halbfett.otf"],
  ["ITCGaramond", 400, "ITCGaramondStd-Bk.ttf"],
];
const CUT_NAME = { 400: "Buch", 500: "Kräftig", 600: "Halbfett", 700: "Dreiviertelfett" };

const fontFace = ([family, weight, file]) => {
  const b64 = readFileSync(join(FONTS, file)).toString("base64");
  const fmt = file.endsWith(".otf") ? "opentype" : "truetype";
  return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;`
    + `src:url(data:font/${fmt === "opentype" ? "otf" : "ttf"};base64,${b64}) format("${fmt}")}`;
};

// ── BEFORE — frozen at git HEAD~2 ───────────────────────────────────────────
const B_FS = { nano: 10, micro: 11, caption: 12, body: 13, bodyLg: 14, subtitle: 16, title: 18, headline: 22, display: 26, hero: 34, stat: 46, editorial: 30 };
const B_LH = { flush: 1.0, tight: 1.15, snug: 1.3, normal: 1.5, relaxed: 1.62 };
const B_BANDS = [[26, -0.02], [18, -0.015], [16, -0.01], [13, 0]];
const B_CAPS = { label: 0.085, caps: 0.115 };
const bTrackEm = (size, role = "text") =>
  role === "text" ? (B_BANDS.find(([lo]) => size >= lo)?.[1] ?? 0.005)
  : role === "serif" ? -0.008
  : B_CAPS[role];
/** The BEFORE weights, per named style — 700 was the app's default heading cut. */
const B_W = { hero: 700, display: 600, headline: 600, title: 600, subtitle: 600, bodyLg: 500, body: 400 };

// ── AFTER — recomputed from the live ladder's defining constants ────────────
const SCALE_RATIO = 1.25;
const STEP = Math.sqrt(SCALE_RATIO);
const TYPE_REF = 16;
const OPTICAL_K = 0.02 / Math.log(46 / TYPE_REF);
const SERIF_SIZE_RATIO = 0.523 / 0.4409;
const FIGURE_INK_EM = 0.804;
const RUNG_INDEX = { nano: -4, micro: -3, caption: -2, body: -1, bodyLg: 0, subtitle: 1, title: 2, headline: 3, display: 5, hero: 7, stat: 10 };
const rung = (n) => Math.round(TYPE_REF * STEP ** n);
const A_FS = Object.fromEntries(Object.entries(RUNG_INDEX).map(([k, n]) => [k, rung(n)]));
A_FS.editorial = Math.round(A_FS.display * SERIF_SIZE_RATIO);
const A_LH = { flush: 0.9, tight: 1.15, snug: 1.3, normal: 1.5, relaxed: 1.62, editorial: 1.23 };
const aTrackEm = (size, role = "text") => {
  const optical = Math.min(0.012, Math.max(-0.024, OPTICAL_K * Math.log(TYPE_REF / size)));
  return role === "text" ? optical : role === "serif" ? optical * 0.5 : B_CAPS[role] + optical;
};
/** The AFTER weights — the ladder stops at 600 on this ground. */
const A_W = { hero: 600, display: 600, headline: 600, title: 600, subtitle: 500, bodyLg: 500, body: 400 };

/**
 * The constants above DEFINE the after-ladder, so they are the one thing here
 * that can silently disagree with the app. Re-read scale.ts and check.
 */
function assertMatchesScaleTs() {
  const src = readFileSync(join(ROOT, "packages", "core", "src", "scale.ts"), "utf8");
  const num = (re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`build-type-proof: could not find ${label} in scale.ts`);
    return Number(m[1]);
  };
  const checks = [
    ["SCALE_RATIO", SCALE_RATIO, num(/export const SCALE_RATIO = ([\d.]+)/, "SCALE_RATIO")],
    ["TYPE_REF", TYPE_REF, num(/export const TYPE_REF = ([\d.]+)/, "TYPE_REF")],
    ["lh.flush", A_LH.flush, Number((FIGURE_INK_EM + 0.096).toFixed(2))],
  ];
  for (const [name, mine, theirs] of checks) {
    if (mine !== theirs) throw new Error(`build-type-proof: ${name} is ${mine} here and ${theirs} in scale.ts`);
  }
  for (const [role, n] of Object.entries(RUNG_INDEX)) {
    const re = new RegExp(`${role}: rung\\(RUNG_INDEX\\.${role}\\)`);
    if (!re.test(src)) throw new Error(`build-type-proof: scale.ts no longer derives fs.${role} from RUNG_INDEX`);
    const declared = src.match(new RegExp(`\\n  ${role}: (-?\\d+), //`));
    if (declared && Number(declared[1]) !== n) {
      throw new Error(`build-type-proof: fs.${role} sits at exponent ${declared[1]} in scale.ts, ${n} here`);
    }
  }
}

// ── page ────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
/**
 * SINGLE QUOTES INSIDE THE STACK, and it is not a style preference — it is the
 * bug that made the first cut of this file render nothing but inherited type.
 * These strings are interpolated into `style="..."` attributes, so a stack
 * written with double quotes TERMINATES the attribute at its first inner quote:
 * `style="font-family:"Sohne",sans-serif;font-size:10px"` parses as an empty
 * font-family plus garbage, and every specimen silently falls back to the body's
 * 16px. It renders as a plausible page, which is why it needed a browser to
 * catch rather than a reader.
 */
const SANS = "'Sohne',sans-serif", MONO = "'SohneMono',monospace", SERIF = "'ITCGaramond',serif";
const LADDER = ["nano", "micro", "caption", "body", "bodyLg", "subtitle", "title", "headline", "display", "hero", "stat"];
const SPEC = {
  nano: "REST BETWEEN SETS", micro: "Working set", caption: "Logged 18:42, Apple Watch",
  body: "Squat felt heavy off the floor today.", bodyLg: "Back squat, five by five",
  subtitle: "This week", title: "Today's session", headline: "Endurance",
  display: "Train like a hybrid", hero: "Wrapped", stat: "92.4",
};
/** `nano` and `stat` are mono-only rungs — drawing them in the sans would show a
 *  size in a face no named style pairs it with. */
const RUNG_CUT = { nano: ["mono", true], stat: ["mono", false] };

const pane = (side, body, foot) => `
  <div class="pane ${side}">
    <p class="tag ${side}"><i></i>${side === "b" ? "Before" : "After"}</p>
    <div class="spec">${body}</div>
    <p class="foot">${foot}</p>
  </div>`;
const cmp = (title, why, before, after) => `
<div class="cmp">
  <div class="cmp-hd"><h4>${title}</h4><p class="why">${why}</p></div>
  <div class="pair">${before}${after}</div>
</div>`;

function ramp(FS, trackEm, isAfter) {
  return LADDER.map((r) => {
    const v = FS[r];
    const [cut, up] = RUNG_CUT[r] ?? ["sans", false];
    const fam = cut === "mono" ? MONO : SANS;
    const extra = up ? "text-transform:uppercase;font-weight:500;" : "font-weight:600;";
    const n = RUNG_INDEX[r];
    return `<div class="rung">
      <span class="idx">${isAfter ? (n >= 0 ? "+" + n : n) : "—"}</span>
      <span class="spec-line" style="font-family:${fam};${extra}font-size:${v}px;letter-spacing:${trackEm(v).toFixed(5)}em">${esc(SPEC[r])}</span>
      <span class="val">${r} <b>${v}</b></span>
    </div>`;
  }).join("");
}

function weightRow(FS, W, trackEm, flush) {
  const t = (v) => trackEm(v).toFixed(5);
  return `
  <p style="font-family:${MONO};font-weight:500;font-size:${FS.nano}px;letter-spacing:${(B_CAPS.label + (flush === 0.9 ? aTrackEm(FS.nano) : 0)).toFixed(5)}em;text-transform:uppercase;color:#8a9691;margin:0 0 8px">Block 3 — week 2 of 4</p>
  <p style="font-family:${SANS};font-weight:${W.display};font-size:${FS.display}px;line-height:${Math.round(FS.display * 1.15)}px;letter-spacing:${t(FS.display)}em;margin:0">Lower body, heavy</p>
  <p style="font-family:${SANS};font-weight:${W.bodyLg};font-size:${FS.bodyLg}px;line-height:${Math.round(FS.bodyLg * 1.3)}px;letter-spacing:${t(FS.bodyLg)}em;margin:8px 0 0">Back squat, Romanian deadlift, split squat</p>
  <p style="font-family:${SANS};font-weight:400;font-size:${FS.body}px;line-height:${Math.round(FS.body * 1.5)}px;letter-spacing:${t(FS.body)}em;margin:8px 0 0">Five sets of five at 92.4 kg. Felt heavy off the floor, and from the third rep onward the bar speed dropped enough that the last set went to an eight.</p>
  <div class="hr"></div>
  <div style="display:flex;align-items:baseline;gap:${Math.round(FS.stat * 0.25)}px">
    <span style="font-family:${MONO};font-weight:600;font-size:${FS.stat}px;line-height:${Math.round(FS.stat * flush)}px;letter-spacing:-0.035em">92.4</span>
    <span style="font-family:${SANS};font-weight:500;font-size:${Math.min(FS.subtitle, Math.max(FS.micro, Math.round(FS.stat * 0.42)))}px;color:#8a9691">kg</span>
  </div>
  <p style="font-family:${SANS};font-weight:${W.subtitle};font-size:${FS.subtitle}px;line-height:${Math.round(FS.subtitle * 1.3)}px;letter-spacing:${t(FS.subtitle)}em;margin:8px 0 0">Top set, up 2.5 kg</p>`;
}

function build() {
  assertMatchesScaleTs();
  const css = FACES.map(fontFace).join("\n");

  const weightLadder = [400, 500, 600, 700].map((wt) => `
    <div class="wrow">
      <span class="wlab">${wt} ${CUT_NAME[wt]}</span>
      <span style="font-family:${SANS};font-weight:${wt};font-size:34px;letter-spacing:-.0148em">Back squat</span>
      <span class="wnote">${wt === 700 ? "the app's default at 298 sites" : wt === 600 ? "the ceiling on this ground" : ""}</span>
    </div>`).join("");

  const figures = [
    ["metric", 600, B_FS.stat, A_FS.stat, "92.4"],
    ["figureLg", 600, B_FS.display, A_FS.display, "2 480"],
    ["figure", 600, B_FS.headline, A_FS.headline, "148"],
    ["readout", 500, B_FS.headline, A_FS.headline, "01:42:18"],
  ].map(([tok, wt, bv, av, txt]) => cmp(
    `<span class="tok">${tok}</span>`, `Söhne Mono ${CUT_NAME[wt]} — ${esc(txt)}`,
    pane("b", `<span style="font-family:${MONO};font-weight:${wt};font-size:${bv}px;line-height:${Math.round(bv * 1.0)}px;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${esc(txt)}</span>`,
      `${wt} ${CUT_NAME[wt]} — ${bv}/${Math.round(bv * 1.0)} — flush 1.00`),
    pane("a", `<span style="font-family:${MONO};font-weight:${wt};font-size:${av}px;line-height:${Math.round(av * 0.9)}px;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${esc(txt)}</span>`,
      `${wt} ${CUT_NAME[wt]} — ${av}/${Math.round(av * 0.9)} — flush 0.90`),
  )).join("");

  const QUOTE = "You have trained twelve days straight. The next one is not the one that makes you fitter.";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HYBRID type proof — the real faces</title>
<style>
${css}
:root{--ink:#0c0d0c;--ink2:#212126;--line:#2f2f36;--chalk:#f7f6f3;--ash:#8a9691;--lime:#c3d363;--red:#ec935e}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--chalk);font-family:${SANS};font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.shell{max-width:1240px;margin:0 auto;padding:0 clamp(18px,4.5vw,44px)}
h1{font-family:${SANS};font-weight:600;font-size:clamp(30px,5.5vw,52px);line-height:1.06;letter-spacing:-.022em;margin:0}
h2{font-family:${SANS};font-weight:600;font-size:30px;line-height:1.15;letter-spacing:-.018em;margin:0}
h4{font-family:${SANS};font-weight:600;font-size:14px;margin:0}
p{margin:0;max-width:66ch}
.lead{font-size:18px;line-height:1.55;max-width:64ch;color:var(--ash)}
.over{font-family:${MONO};font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.124em;color:var(--ash);margin:0}
.tok{font-family:${MONO};font-weight:500;font-size:13px;color:var(--lime)}
section{padding:56px 0;border-top:1px solid var(--line)}
.stack{display:flex;flex-direction:column;gap:26px}
.banner{background:var(--lime);color:var(--ink);padding:12px 0;font-family:${MONO};font-size:12px;letter-spacing:.02em}
.banner b{font-weight:600}
.cmp{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--ink2)}
.cmp-hd{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:13px 20px;border-bottom:1px solid var(--line)}
.why{font-family:${MONO};font-size:12px;color:var(--ash);text-align:right}
.pair{display:grid;grid-template-columns:1fr 1fr}
@media(max-width:820px){.pair{grid-template-columns:1fr}}
.pane{padding:22px 20px;min-width:0}
.pane+.pane{border-left:1px solid var(--line)}
@media(max-width:820px){.pane+.pane{border-left:0;border-top:1px solid var(--line)}}
.pane.b{background:rgba(236,147,94,.028)} .pane.a{background:rgba(195,211,99,.028)}
.tag{font-family:${MONO};font-weight:500;font-size:9.5px;text-transform:uppercase;letter-spacing:.09em;margin:0 0 14px;display:flex;gap:8px;align-items:center}
.tag i{width:6px;height:6px;border-radius:50%;background:currentColor}
.tag.b{color:var(--red)} .tag.a{color:var(--lime)}
.foot{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-family:${MONO};font-size:11px;color:var(--ash);font-variant-numeric:tabular-nums}
.rung{display:grid;grid-template-columns:34px 1fr auto;gap:14px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--line)}
.rung:last-child{border-bottom:0}
.idx{font-family:${MONO};font-size:10px;color:var(--line);text-align:right;font-variant-numeric:tabular-nums}
.spec-line{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.14}
.val{font-family:${MONO};font-size:10.5px;color:var(--ash);font-variant-numeric:tabular-nums;white-space:nowrap}
.val b{color:var(--chalk);font-weight:500}
.hr{height:1px;background:var(--line);margin:14px 0}
.wrow{display:grid;grid-template-columns:130px 1fr auto;gap:18px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--line)}
.wrow:last-child{border-bottom:0}
.wlab,.wnote{font-family:${MONO};font-size:11px;color:var(--ash)}
.wnote{color:var(--red)}
.card{background:var(--ink2);border:1px solid var(--line);border-radius:14px;padding:20px}
footer{padding:44px 0 70px;border-top:1px solid var(--line);color:var(--ash);font-size:13px}
</style></head><body>

<div class="banner"><div class="shell"><b>REAL FACES.</b> Söhne, Söhne Mono and ITC Garamond are embedded in this file
from apps/mobile/assets/fonts. Local only — do not commit or publish this page.</div></div>

<div class="shell">
<header style="padding:70px 0 6px">
  <p class="over">HYBRID — type proof — the actual binaries</p>
  <h1 style="margin-top:20px;max-width:16ch">This is what the app really draws.</h1>
  <p class="lead" style="margin-top:22px">The published artifacts are set in Google Fonts stand-ins, because an Artifact
  is a public URL and these faces are licensed. Their numbers are exact and their letterforms are somebody else's — so
  this page exists to show the pairing itself. Same comparisons, real type.</p>
</header>

<section>
  <p class="over">01 — the ladder</p>
  <h2 style="margin-top:10px">Eight rungs moved.</h2>
  ${cmp("The eleven rungs, at true size", "nano and stat are mono-only rungs",
    pane("b", `<div>${ramp(B_FS, (v) => bTrackEm(v), false)}</div>`, "ladder 10–46 — old bands"),
    pane("a", `<div>${ramp(A_FS, (v) => aTrackEm(v), true)}</div>`, "ladder 10–49 — optical curve"))}
</section>

<section>
  <p class="over">02 — weight</p>
  <h2 style="margin-top:10px">The four cuts, at 34dp, on the app's ground.</h2>
  <p class="lead" style="margin:16px 0 22px">This is the argument that most needs the real face. Light strokes on
  near-black bleed outward, so every weight reads heavier than it measures — and Dreiviertelfett was the default.</p>
  <div class="card">${weightLadder}</div>
  <div style="height:26px"></div>
  ${cmp("A card, as the app drew it", "Söhne — heading, body, figure and unit",
    pane("b", weightRow(B_FS, B_W, (v) => bTrackEm(v), 1.0), "F.black 700 — flush 1.00"),
    pane("a", weightRow(A_FS, A_W, (v) => aTrackEm(v), 0.9), "600 ceiling — flush 0.90"))}
</section>

<section>
  <p class="over">03 — figures</p>
  <h2 style="margin-top:10px">Söhne Mono, and the line box cut to its ink.</h2>
  <div class="stack" style="margin-top:22px">${figures}</div>
</section>

<section>
  <p class="over">04 — the pairing</p>
  <h2 style="margin-top:10px">Söhne beside ITC Garamond, x-heights matched.</h2>
  <p class="lead" style="margin:16px 0 22px">The one thing a stand-in cannot show you at all. Left, the serif at 30
  off a stale 0.445 literal, set at snug. Right, 33 off the measured 0.4409, at its own leading.</p>
  ${cmp("The editorial voice", "ITC Garamond Book beside Söhne Halbfett",
    pane("b", `<p style="font-family:${SANS};font-weight:600;font-size:${B_FS.display}px;line-height:${Math.round(B_FS.display * 1.15)}px;letter-spacing:${bTrackEm(B_FS.display).toFixed(5)}em;margin:0 0 14px">This week</p>
      <p style="font-family:${SERIF};font-weight:400;font-size:${B_FS.editorial}px;line-height:${Math.round(B_FS.editorial * B_LH.snug)}px;letter-spacing:-0.008em;margin:0;max-width:22ch">${QUOTE}</p>`,
      `sans ${B_FS.display} — serif ${B_FS.editorial}/${Math.round(B_FS.editorial * B_LH.snug)} — snug`),
    pane("a", `<p style="font-family:${SANS};font-weight:600;font-size:${A_FS.display}px;line-height:${Math.round(A_FS.display * 1.15)}px;letter-spacing:${aTrackEm(A_FS.display).toFixed(5)}em;margin:0 0 14px">This week</p>
      <p style="font-family:${SERIF};font-weight:400;font-size:${A_FS.editorial}px;line-height:${Math.round(A_FS.editorial * A_LH.editorial)}px;letter-spacing:${aTrackEm(A_FS.editorial, "serif").toFixed(5)}em;margin:0;max-width:22ch">${QUOTE}</p>
      <p style="font-family:${SANS};font-weight:500;font-size:${A_FS.caption}px;line-height:${Math.round(A_FS.caption * 1.3)}px;color:var(--ash);margin:14px 0 0">Marek Wiśniewski, strength coach</p>`,
      `sans ${A_FS.display} — serif ${A_FS.editorial}/${Math.round(A_FS.editorial * A_LH.editorial)} — editorial 1.23`))}
</section>

<footer><div style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap">
<p style="margin:0;max-width:58ch">Generated by <code>reference/build-type-proof.mjs</code> from the binaries in
apps/mobile/assets/fonts. The Söhne cuts here are the 121-glyph evaluation files extended by sohne-extend.py, so a
character outside that set falls through to the system face — that is a property of the trial licence, not of the
type system.</p>
<p style="margin:0;white-space:nowrap">HYBRID — local proof</p>
</div></footer>
</div></body></html>`;
}

const out = process.argv[2];
if (!out) {
  console.error("usage: node reference/build-type-proof.mjs <output.html>   (write it OUTSIDE the repo)");
  process.exit(1);
}
writeFileSync(out, build());
console.log(`wrote ${out}`);
