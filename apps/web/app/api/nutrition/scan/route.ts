import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { signalUnit } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Scan a product / nutrition label and let Claude read the macros, then save
// them to the nutrition log. ATHLETE+ only (it's part of Full). The client
// sends a base64 image; Claude vision extracts kcal/protein/carbs/fat for the
// stated servings, and we write them as nutrition Signals (source "scan").
export const maxDuration = 60;

function isAthlete(u: { role: string; entitlement: string }): boolean {
  return u.role === "ADMIN" || u.role === "COACH" || u.entitlement === "paid";
}

const SYSTEM = `You read food product labels, barcodes, and photos of meals and return their nutrition as STRICT JSON only — no prose, no markdown.
Return exactly: {"food": string, "servings": number, "kcal": number, "protein": number, "carbs": number, "fat": number, "confidence": number, "note": string}.
- Report the TOTAL for the servings the user is logging (default servings=1 = one serving as shown on the label).
- kcal in kilocalories; protein/carbs/fat in grams.
- confidence 0..1 (how sure you are it's a readable food label/photo).
- If the image is not food or is unreadable, set confidence to 0 and all macros to 0 and explain in note.
Output ONLY the JSON object.`;

type Parsed = { food: string; servings: number; kcal: number; protein: number; carbs: number; fat: number; confidence: number; note: string };

function extractJson(text: string): Parsed | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return {
      food: typeof o.food === "string" ? o.food.slice(0, 120) : "Scanned item",
      servings: num(o.servings) || 1,
      kcal: num(o.kcal),
      protein: num(o.protein),
      carbs: num(o.carbs),
      fat: num(o.fat),
      confidence: typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0,
      note: typeof o.note === "string" ? o.note.slice(0, 280) : "",
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAthlete(user))
    return NextResponse.json({ error: "Scanning is part of Full — upgrade to scan labels." }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn’t configured on this deployment yet.", configured: false }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { image?: unknown; mediaType?: unknown; note?: unknown };
  if (typeof body.image !== "string" || !body.image)
    return NextResponse.json({ error: "image required" }, { status: 400 });

  // Accept a data URL ("data:image/jpeg;base64,…") or a bare base64 string.
  let data = body.image;
  let mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
  const dataUrl = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (dataUrl) { mediaType = dataUrl[1]!; data = dataUrl[2]!; }
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType))
    return NextResponse.json({ error: "unsupported image type" }, { status: 400 });
  if (data.length > 7_000_000) // ~5MB decoded cap
    return NextResponse.json({ error: "image too large — try a smaller photo" }, { status: 413 });

  let parsed: Parsed | null = null;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } },
            { type: "text", text: typeof body.note === "string" && body.note.trim() ? `Context: ${body.note.trim().slice(0, 200)}. Read this and return the JSON.` : "Read this food label/photo and return the JSON." },
          ],
        },
      ],
    });
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    parsed = extractJson(text);
  } catch {
    return NextResponse.json({ error: "Couldn’t analyse the image — try again." }, { status: 502 });
  }

  if (!parsed || parsed.confidence < 0.25 || (parsed.kcal === 0 && parsed.protein === 0 && parsed.carbs === 0 && parsed.fat === 0))
    return NextResponse.json({ error: parsed?.note || "Couldn’t read a nutrition label in that image. Try a clearer photo.", parsed }, { status: 422 });

  // Persist the detected macros as nutrition signals (source "scan").
  const ts = new Date();
  const rows: { kind: "energyIntake" | "protein" | "carbs" | "fat"; value: number }[] = [
    { kind: "energyIntake", value: Math.round(parsed.kcal) },
    { kind: "protein", value: Math.round(parsed.protein) },
    { kind: "carbs", value: Math.round(parsed.carbs) },
    { kind: "fat", value: Math.round(parsed.fat) },
  ];
  try {
    await prisma.signal.createMany({
      data: rows
        .filter((r) => r.value > 0)
        .map((r) => ({ userId: user.id, kind: r.kind, value: r.value, unit: signalUnit(r.kind), source: "scan", ts })),
    });
  } catch {
    return NextResponse.json({ error: "Analysed it but couldn’t save — try again." }, { status: 500 });
  }

  return NextResponse.json({ saved: true, ...parsed });
}
