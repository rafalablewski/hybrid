import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getOrCreateDbUser, entitlementOf } from "@/lib/server-auth";
import { rateLimit } from "@/lib/guard";

// AI nutrition-label scan (Full). Accepts a photo of a nutrition label / product
// and asks Claude (vision, server-side only) to read the per-serving macros so an
// athlete can log a meal without typing. Free users are gated on the client
// (locked → upgrade) AND here (403) so the paid feature can't be called directly.
// Falls back gracefully (503) until ANTHROPIC_API_KEY is set in the deployment.
type Macros = { name: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp",
};

const PROMPT = `You are reading a food nutrition label (or a product photo) to log a meal.
Return ONLY minified JSON, no prose, in this exact shape:
{"name": string|null, "kcal": number|null, "protein": number|null, "carbs": number|null, "fat": number|null}
- name: a short human name for the food/product if visible, else null.
- kcal: energy for ONE serving in kcal (if only kJ is shown, convert: kJ / 4.184).
- protein / carbs / fat: grams per serving.
- If both "per 100g" and a serving size are shown, use the SERVING values; if only per-100g is available, use per-100g and append "(per 100g)" to name.
- Use null for anything you cannot read. Numbers only, no units. Do not guess wildly.`;

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Full-only feature — defense-in-depth beyond the client gate.
  if (entitlementOf(user) !== "paid") return NextResponse.json({ error: "forbidden", full: true }, { status: 403 });

  // Expensive (vision LLM) — cap per IP to blunt cost-abuse.
  const limited = await rateLimit(request, { key: "nutrition-scan", limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false }, { status: 503 });

  let body: { image?: string; mediaType?: string };
  try { body = (await request.json()) as { image?: string; mediaType?: string }; } catch { return NextResponse.json({ error: "bad-request" }, { status: 400 }); }
  const raw = body.image ?? "";
  // Accept a data URL (data:image/...;base64,XXXX) or a bare base64 string.
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(raw);
  const mediaType = MEDIA[(m?.[1] ?? body.mediaType ?? "image/jpeg").toLowerCase()] ?? "image/jpeg";
  const data = m ? m[2]! : raw;
  if (!data || data.length < 32) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  // Guard oversized uploads (base64 ≈ 1.37× bytes; ~8 MB image cap).
  if (data.length > 11_000_000) return NextResponse.json({ error: "too-large" }, { status: 413 });

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 400,
      system: PROMPT,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data } }] }],
    });
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Macros;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    return NextResponse.json({
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : null,
      kcal: num(parsed.kcal), protein: num(parsed.protein), carbs: num(parsed.carbs), fat: num(parsed.fat),
    });
  } catch {
    return NextResponse.json({ error: "scan-failed" }, { status: 502 });
  }
}
