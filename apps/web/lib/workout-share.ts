// Web workout sharing — parity with the mobile share card, plus a 9:16
// Instagram-story image. We draw the card on a <canvas> (no extra dependency,
// full control over the story layout), export a PNG, and hand it to the Web
// Share API (navigator.share with files — supported on iOS Safari + Android
// Chrome). Where file-share isn't available we fall back to downloading the
// PNG, and where canvas/share is unavailable at all, to a plain text share.
import { brand, fmtTonnage, fmtWeight, type WeightUnit } from "@hybrid/core";

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

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
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
