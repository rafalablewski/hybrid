// Web workout sharing — parity with the mobile share card, plus a 9:16
// Instagram-story image. We draw the card on a <canvas> (no extra dependency,
// full control over the story layout), export a PNG, and hand it to the Web
// Share API (navigator.share with files — supported on iOS Safari + Android
// Chrome). Where file-share isn't available we fall back to downloading the
// PNG, and where canvas/share is unavailable at all, to a plain text share.
import { brand, fmtTonnage, fmtWeight, shareTheme, type ShareTheme, type ShareThemeId, type WeightUnit } from "@hybrid/core";

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
  lime: "#c4f035",
  chalk: "#f3f4ef",
  ash: "#8b8f86",
};

const DISPLAY = "800 //px 'Geist','Inter',system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = "//px 'Geist Mono','SFMono-Regular',ui-monospace,Menlo,monospace";
const font = (spec: string, px: number) => spec.replace("//", `${px} `).replace("//", "");

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
  glow.addColorStop(0, "rgba(196,240,53,0.20)");
  glow.addColorStop(1, "rgba(196,240,53,0)");
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
  | { kind: "prs"; eyebrow: string; headline: string; rows: { left: string; right: string; hot?: boolean }[] }
  | { kind: "muscle"; eyebrow: string; bars: { label: string; pct: number; value: string }[] }
  | { kind: "fun"; eyebrow: string; emoji: string; text: string };

const SW = 1080;
const SH = 1920;
const SPAD = 96;

/** Per-theme palette in the shape the painters use (mirrors the old COL keys). */
type Pal = { ink: string; ink2: string; line: string; lime: string; chalk: string; ash: string };
const palette = (th: ShareTheme): Pal => ({ ink: th.bg, ink2: th.surface, line: th.line, lime: th.accent, chalk: th.fg, ash: th.muted });

/** Hex (#rrggbb) → rgba() with the given alpha. Passes through non-hex as-is. */
function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Paint the chosen theme's decorative backdrop (glow / blobs / mesh / ticker). */
function paintBackdrop(ctx: CanvasRenderingContext2D, th: ShareTheme, tickerText: string) {
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, SW, SH);
  const disc = (x: number, y: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SW, SH);
  };
  const [c0 = th.accent, c1 = th.accent, c2 = th.accent] = th.glow;
  if (th.backdrop === "glow") {
    disc(SW * 0.78, SH * 0.16, 620, c0, 0.2);
  } else if (th.backdrop === "blobs") {
    disc(SW * 0.18, SH * 0.1, 560, c0, 0.28);
    disc(SW * 0.92, SH * 0.34, 520, c1, 0.24);
    disc(SW * 0.2, SH * 0.82, 600, c2, 0.22);
  } else if (th.backdrop === "mesh") {
    disc(SW * 0.12, SH * 0.06, 700, c0, 0.5);
    disc(SW * 0.96, SH * 0.16, 640, c1, 0.42);
    disc(SW * 0.5, SH * 1.02, 760, c2, 0.46);
    disc(SW * 0.86, SH * 0.78, 560, c0, 0.3);
  } else {
    // ticker — faint repeated wordmark/eyebrow filling the height.
    ctx.save();
    ctx.font = font(DISPLAY, 116);
    ctx.fillStyle = withAlpha(th.fg, 0.05);
    ctx.textAlign = "left";
    const word = `${(tickerText || brand.name).toUpperCase()}   `;
    const line = word.repeat(4);
    for (let y = 150; y < SH; y += 150) ctx.fillText(line, ((y / 150) % 2 === 0 ? -120 : -260), y);
    ctx.restore();
    disc(SW * 0.5, SH * 0.5, 760, th.bg, 0.55); // vignette so content stays legible
  }
}

function paintFrame(ctx: CanvasRenderingContext2D, eyebrow: string, th: ShareTheme, tickerText: string) {
  const P = palette(th);
  paintBackdrop(ctx, th, tickerText);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(DISPLAY, 64);
  ctx.fillStyle = P.chalk;
  ctx.fillText(brand.name, SPAD, 200);
  const wmW = ctx.measureText(brand.name).width;
  ctx.fillStyle = P.lime;
  ctx.fillText(".", SPAD + wmW + 6, 200);
  ctx.font = font(MONO, 28);
  ctx.fillStyle = P.lime;
  ctx.fillText(eyebrow.toUpperCase(), SPAD, 250);
  ctx.font = font(MONO, 30);
  ctx.fillStyle = P.ash;
  ctx.fillText("Tracked with HYBRID.", SPAD, SH - 120);
}

/** Draw any summary slide as the branded 9:16 PNG, in the chosen theme. */
export function drawSlideStory(slide: StorySlide, units: WeightUnit, t: (k: string) => string, themeId?: ShareThemeId): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const th = shareTheme(themeId);
  const COL = palette(th);
  const tickerText = slide.kind === "overview" ? slide.stats.title || brand.name : slide.eyebrow;
  paintFrame(ctx, slide.eyebrow, th, tickerText);

  if (slide.kind === "overview") {
    const s = slide.stats;
    ctx.font = font(DISPLAY, 96);
    ctx.fillStyle = COL.chalk;
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
      ctx.fillStyle = COL.chalk;
      ctx.fillText(c.value, cx, 880);
      ctx.font = font(MONO, 28);
      ctx.fillStyle = COL.ash;
      ctx.fillText(c.label, cx, 932);
    });
    ctx.textAlign = "left";
  } else if (slide.kind === "prs") {
    ctx.font = font(DISPLAY, 64);
    ctx.fillStyle = COL.lime;
    ctx.fillText(slide.headline, SPAD, 520);
    let y = 660;
    slide.rows.slice(0, 7).forEach((r) => {
      ctx.font = font(DISPLAY, 46);
      ctx.fillStyle = COL.chalk;
      ctx.fillText(`${r.hot ? "🏆 " : ""}${r.left}`, SPAD, y);
      if (r.right) {
        ctx.textAlign = "right";
        ctx.fillStyle = r.hot ? COL.lime : COL.chalk;
        ctx.fillText(r.right, SW - SPAD, y);
        ctx.textAlign = "left";
      }
      y += 86;
    });
  } else if (slide.kind === "muscle") {
    let y = 560;
    slide.bars.forEach((b) => {
      ctx.font = font(DISPLAY, 44);
      ctx.fillStyle = COL.chalk;
      ctx.fillText(b.label, SPAD, y);
      ctx.textAlign = "right";
      ctx.font = font(MONO, 34);
      ctx.fillStyle = COL.ash;
      ctx.fillText(b.value, SW - SPAD, y);
      ctx.textAlign = "left";
      const barY = y + 26;
      const barW = SW - SPAD * 2;
      ctx.fillStyle = COL.ink2;
      ctx.fillRect(SPAD, barY, barW, 22);
      ctx.fillStyle = COL.lime;
      ctx.fillRect(SPAD, barY, Math.max(barW * 0.04, (barW * Math.max(4, b.pct)) / 100), 22);
      y += 130;
    });
  } else {
    ctx.textAlign = "center";
    ctx.font = font(DISPLAY, 200);
    ctx.fillText(slide.emoji, SW / 2, 760);
    ctx.font = font(DISPLAY, 64);
    ctx.fillStyle = COL.chalk;
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
  themeId?: ShareThemeId,
): Promise<"shared" | "downloaded" | "text" | "cancelled"> {
  try {
    const blob = await drawSlideStory(slide, units, t, themeId);
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
