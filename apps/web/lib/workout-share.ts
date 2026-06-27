// Web workout sharing — parity with the mobile share card, plus a 9:16
// Instagram-story image. We draw the card on a <canvas> (no extra dependency,
// full control over the story layout), export a PNG, and hand it to the Web
// Share API (navigator.share with files — supported on iOS Safari + Android
// Chrome). Where file-share isn't available we fall back to downloading the
// PNG, and where canvas/share is unavailable at all, to a plain text share.
import { brand, fmtTonnage, fmtWeight, storyStyle, type StoryStyle, type StoryStyleId, type WeightUnit } from "@hybrid/core";

export type ShareBest = { name: string; e1rm: number; pr?: boolean };
export type ShareStats = {
  title: string;
  minutes: number;
  sets: number;
  volume: number;
  bests: ShareBest[];
  firstEver?: boolean;
};

const COL = {
  ink: "#0c0d0c",
  ink2: "#141614",
  line: "#26271f",
  lime: "#c7ef00",
  chalk: "#f3f4ef",
  ash: "#8b8f86",
};

const DISPLAY = "800 //px 'Geist','Inter',system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = "//px 'Geist Mono','SFMono-Regular',ui-monospace,Menlo,monospace";
// The spec carries a `//px` placeholder; swap in the size so the unit stays
// glued to the number ("96px") — a stray space ("96 px") is an invalid CSS font
// string, which canvas silently ignores, leaving every label at the default 10px.
const font = (spec: string, px: number) => spec.replace("//px", `${px}px`);

/** Build the plain-text caption used as the share fallback and body text. */
export function shareText(stats: ShareStats, units: WeightUnit, t: (k: string) => string): string {
  const top = stats.bests[0];
  return [
    stats.firstEver ? "My first HYBRID workout 💪" : `💪 ${stats.title || "Workout"} — done.`,
    `${stats.minutes} min · ${stats.sets} ${t("w.train.logger.sets")} · ${fmtTonnage(stats.volume, units)}`,
    top ? `🏆 ${top.name} ${fmtWeight(top.e1rm, units)}` : null,
    "Tracked with HYBRID.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Draw the branded 9:16 (1080×1920) story card and return it as a PNG blob. */
export function drawStoryCard(stats: ShareStats, units: WeightUnit, t: (k: string) => string): Promise<Blob | null> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  // Backdrop + a soft lime glow disc (the Aurora membrane look).
  ctx.fillStyle = COL.ink;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.16, 0, W * 0.78, H * 0.16, 620);
  glow.addColorStop(0, "rgba(199,239,0,0.20)");
  glow.addColorStop(1, "rgba(199,239,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const PAD = 96;

  // Wordmark — "HYBRID" with the lime dot.
  ctx.textBaseline = "alphabetic";
  ctx.font = font(DISPLAY, 64);
  ctx.fillStyle = COL.chalk;
  ctx.fillText(brand.name, PAD, 200);
  const wmW = ctx.measureText(brand.name).width;
  ctx.fillStyle = COL.lime;
  ctx.fillText(".", PAD + wmW + 6, 200);
  ctx.font = font(MONO, 26);
  ctx.fillStyle = COL.lime;
  ctx.fillText("STRENGTH & CONDITIONING", PAD, 250);

  // Headline.
  ctx.font = font(DISPLAY, 96);
  ctx.fillStyle = COL.chalk;
  const title = stats.firstEver ? "First workout 🎉" : stats.title || "Workout";
  wrapText(ctx, title, PAD, 470, W - PAD * 2, 104);

  // The three headline stats in a row.
  const stat = [
    { label: "MIN", value: String(stats.minutes) },
    { label: t("w.train.logger.liveSets"), value: String(stats.sets) },
    { label: t("w.train.logger.liveVolume"), value: fmtTonnage(stats.volume, units) },
  ];
  const rowY = 760;
  const colW = (W - PAD * 2) / 3;
  stat.forEach((s, i) => {
    const cx = PAD + colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.font = font(DISPLAY, 92);
    ctx.fillStyle = COL.chalk;
    ctx.fillText(s.value, cx, rowY);
    ctx.font = font(MONO, 28);
    ctx.fillStyle = COL.ash;
    ctx.fillText(s.label, cx, rowY + 52);
  });
  ctx.textAlign = "left";

  // "Today's bests" list (est. 1RM), PR-marked.
  let y = 1010;
  if (stats.bests.length) {
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 70;
    ctx.font = font(MONO, 30);
    ctx.fillStyle = COL.lime;
    ctx.fillText("TODAY'S BESTS", PAD, y);
    y += 70;
    stats.bests.slice(0, 5).forEach((b) => {
      ctx.font = font(DISPLAY, 46);
      ctx.fillStyle = COL.chalk;
      ctx.fillText(`${b.pr ? "🏆 " : ""}${b.name}`, PAD, y);
      ctx.textAlign = "right";
      ctx.fillStyle = b.pr ? COL.lime : COL.chalk;
      ctx.fillText(fmtWeight(b.e1rm, units), W - PAD, y);
      ctx.textAlign = "left";
      y += 78;
    });
  }

  // Footer.
  ctx.font = font(MONO, 30);
  ctx.fillStyle = COL.ash;
  ctx.fillText("Tracked with HYBRID.", PAD, H - 120);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

// ── Multi-slide story export ───────────────────────────────────────────────
// The summary carousel shares the currently-visible slide. Each slide paints a
// shared branded frame (backdrop/glow/wordmark/eyebrow/footer) plus its own body.

export type StorySlide =
  | { kind: "overview"; eyebrow: string; stats: ShareStats }
  | { kind: "stat"; eyebrow: string; value: string; unit: string; caption?: string }
  | { kind: "prs"; eyebrow: string; headline: string; rows: { left: string; right: string; hot?: boolean }[] }
  | { kind: "muscle"; eyebrow: string; bars: { label: string; pct: number; value: string }[] }
  | { kind: "fun"; eyebrow: string; emoji: string; text: string };

const SW = 1080;
const SH = 1920;
const SPAD = 96;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintFrame(ctx: CanvasRenderingContext2D, eyebrow: string, st: StoryStyle, footer: string) {
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, SW, SH);
  // Optional diagonal gradient over the base (top-left → bottom-right).
  if (st.gradient) {
    const g = ctx.createLinearGradient(0, 0, SW, SH);
    g.addColorStop(0, st.gradient.from);
    g.addColorStop(1, st.gradient.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SW, SH);
  }
  // The style's glow discs (positions are fractions of the card).
  st.discs.forEach((d) => {
    const cx = SW * d.x;
    const cy = SH * d.y;
    const r = SW * d.r;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, d.color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SW, SH);
  });
  // Optional translucent glass slab inset behind the content.
  if (st.panel) {
    const inset = SW * 0.045;
    roundRectPath(ctx, inset, inset, SW - inset * 2, SH - inset * 2, SW * 0.05);
    ctx.fillStyle = st.panel.fill;
    ctx.fill();
    if (st.panel.border) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = st.panel.border;
      ctx.stroke();
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(DISPLAY, 64);
  ctx.fillStyle = st.wordmark;
  ctx.fillText(brand.name, SPAD, 200);
  const wmW = ctx.measureText(brand.name).width;
  ctx.fillStyle = st.accent;
  ctx.fillText(".", SPAD + wmW + 6, 200);
  ctx.font = font(MONO, 28);
  ctx.fillStyle = st.accent;
  ctx.fillText(eyebrow.toUpperCase(), SPAD, 250);
  // Footer: "Tracked with HYBRID." with the trailing brand drawn as the LOGO
  // (display wordmark + lime accent dot) instead of flat muted text.
  const fy = SH - 120;
  const mark = `${brand.name}.`;
  const prefix = footer.endsWith(mark) ? footer.slice(0, -mark.length) : `${footer} `;
  ctx.font = font(MONO, 30);
  ctx.fillStyle = st.muted;
  ctx.fillText(prefix, SPAD, fy);
  const prefixW = ctx.measureText(prefix).width;
  ctx.font = font(DISPLAY, 30);
  ctx.fillStyle = st.wordmark;
  ctx.fillText(brand.name, SPAD + prefixW, fy);
  const markW = ctx.measureText(brand.name).width;
  ctx.fillStyle = st.accent;
  ctx.fillText(".", SPAD + prefixW + markW + 3, fy);
}

/** Draw any summary slide as the branded 9:16 PNG in the chosen style. */
export function drawSlideStory(slide: StorySlide, units: WeightUnit, t: (k: string) => string, styleId?: StoryStyleId): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const st = storyStyle(styleId);
  paintFrame(ctx, slide.eyebrow, st, t("share.tracked"));

  if (slide.kind === "overview") {
    const s = slide.stats;
    ctx.font = font(DISPLAY, 96);
    ctx.fillStyle = st.text;
    wrapText(ctx, s.firstEver ? "First workout 🎉" : s.title || "Workout", SPAD, 470, SW - SPAD * 2, 104);
    const stat = [
      { label: "MIN", value: String(s.minutes) },
      { label: t("w.train.logger.liveSets"), value: String(s.sets) },
      { label: t("w.train.logger.liveVolume"), value: fmtTonnage(s.volume, units) },
    ];
    const colW = (SW - SPAD * 2) / 3;
    stat.forEach((c, i) => {
      const cx = SPAD + colW * i + colW / 2;
      ctx.textAlign = "center";
      ctx.font = font(DISPLAY, 92);
      ctx.fillStyle = st.text;
      ctx.fillText(c.value, cx, 880);
      ctx.font = font(MONO, 28);
      ctx.fillStyle = st.muted;
      ctx.fillText(c.label, cx, 932);
    });
    ctx.textAlign = "left";
  } else if (slide.kind === "stat") {
    // A single hero stat — the cinematic spotlight (Minutes / Total load).
    ctx.textAlign = "left";
    ctx.font = font(DISPLAY, 300);
    ctx.fillStyle = st.text;
    ctx.fillText(slide.value, SPAD, 820);
    ctx.font = font(MONO, 40);
    ctx.fillStyle = st.muted;
    ctx.fillText(slide.unit.toUpperCase(), SPAD, 900);
    if (slide.caption) {
      ctx.font = font(DISPLAY, 50);
      ctx.fillStyle = st.text;
      wrapText(ctx, slide.caption, SPAD, 1010, SW - SPAD * 2, 66);
    }
  } else if (slide.kind === "prs") {
    ctx.font = font(DISPLAY, 64);
    ctx.fillStyle = st.barFill;
    ctx.fillText(slide.headline, SPAD, 520);
    let y = 660;
    slide.rows.slice(0, 7).forEach((r) => {
      ctx.font = font(DISPLAY, 46);
      ctx.fillStyle = st.text;
      ctx.fillText(`${r.hot ? "🏆 " : ""}${r.left}`, SPAD, y);
      if (r.right) {
        ctx.textAlign = "right";
        ctx.fillStyle = r.hot ? st.barFill : st.text;
        ctx.fillText(r.right, SW - SPAD, y);
        ctx.textAlign = "left";
      }
      y += 86;
    });
  } else if (slide.kind === "muscle") {
    let y = 560;
    slide.bars.forEach((b) => {
      ctx.font = font(DISPLAY, 44);
      ctx.fillStyle = st.text;
      ctx.fillText(b.label, SPAD, y);
      ctx.textAlign = "right";
      ctx.font = font(MONO, 34);
      ctx.fillStyle = st.muted;
      ctx.fillText(b.value, SW - SPAD, y);
      ctx.textAlign = "left";
      const barY = y + 26;
      const barW = SW - SPAD * 2;
      ctx.fillStyle = st.barTrack;
      ctx.fillRect(SPAD, barY, barW, 22);
      ctx.fillStyle = st.barFill;
      ctx.fillRect(SPAD, barY, Math.max(barW * 0.04, (barW * Math.max(4, b.pct)) / 100), 22);
      y += 130;
    });
  } else {
    ctx.textAlign = "center";
    ctx.font = font(DISPLAY, 200);
    ctx.fillText(slide.emoji, SW / 2, 760);
    ctx.font = font(DISPLAY, 64);
    ctx.fillStyle = st.text;
    wrapText(ctx, slide.text, SPAD, 940, SW - SPAD * 2, 84, "center");
    ctx.textAlign = "left";
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Share a single summary slide as a 9:16 story image (same delivery + fallbacks
 *  as shareWorkoutStory). `caption` is the plain-text body/fallback. */
export async function shareWorkoutSlide(
  slide: StorySlide,
  caption: string,
  units: WeightUnit,
  t: (k: string) => string,
  styleId?: StoryStyleId,
): Promise<"shared" | "downloaded" | "text" | "cancelled"> {
  try {
    const blob = await drawSlideStory(slide, units, t, styleId);
    if (blob) {
      const file = new File([blob], "hybrid-workout.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: caption } as ShareData);
        return "shared";
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hybrid-workout.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return "downloaded";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
  }
  try {
    if (navigator.share) {
      await navigator.share({ text: caption });
      return "shared";
    }
    await navigator.clipboard?.writeText(caption);
    return "text";
  } catch {
    return "cancelled";
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, align: "left" | "center" = "left") {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = align;
  const tx = align === "center" ? x + maxW / 2 : x;
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, tx, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, tx, yy);
  ctx.textAlign = prevAlign;
}

/**
 * Share the workout as a 9:16 story image. Returns how it was delivered so the
 * caller can show the right confirmation. Never throws (a dismissed share sheet
 * resolves to "cancelled").
 */
export async function shareWorkoutStory(
  stats: ShareStats,
  units: WeightUnit,
  t: (k: string) => string,
): Promise<"shared" | "downloaded" | "text" | "cancelled"> {
  const text = shareText(stats, units, t);
  try {
    const blob = await drawStoryCard(stats, units, t);
    if (blob) {
      const file = new File([blob], "hybrid-workout.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text } as ShareData);
        return "shared";
      }
      // No file-share — download the PNG so it can be posted manually.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hybrid-workout.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return "downloaded";
    }
  } catch (e) {
    // A user dismissing the native sheet rejects with AbortError — not an error.
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    /* fall through to text */
  }
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return "shared";
    }
    await navigator.clipboard?.writeText(text);
    return "text";
  } catch {
    return "cancelled";
  }
}
