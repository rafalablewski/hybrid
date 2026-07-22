import { NextResponse } from "next/server";
import { offSearchUrl, offBarcodeUrl, normalizeOffResults, isLikelyBarcode } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";

// Food search — a thin, auth-gated proxy over Open Food Facts (the free, open,
// no-key food database). GET ?q= runs a text search; GET ?barcode= (or a ?q=
// that is all digits) looks a product up by its EAN/UPC. The response is
// normalized to HYBRID's OffFood shape in core so web + mobile render the same
// rows. We proxy (rather than call OFF from the client) to add a descriptive
// User-Agent, keep the host in one place, and dodge browser CORS. No data is
// stored here — saving a hit into the library still goes through /api/products.

export const runtime = "nodejs";

const UA = "HYBRID/1.0 (hybrid training app; contact: support@hybrid.app)";

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const barcodeParam = (url.searchParams.get("barcode") ?? "").trim();
  const barcode = barcodeParam || (isLikelyBarcode(q) ? q : "");
  if (!q && !barcode) return NextResponse.json({ foods: [] });

  const target = barcode ? offBarcodeUrl(barcode) : offSearchUrl(q);

  // Bound the upstream call so a slow OFF response can't hang the request.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(target, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return NextResponse.json({ foods: [], error: "search_unavailable" }, { status: 502 });
    const json = (await res.json()) as { products?: unknown[]; product?: unknown };
    const foods = normalizeOffResults(json as never, 24);
    return NextResponse.json({ foods });
  } catch {
    // Timeout / network / bad JSON — a graceful empty so the client can fall back
    // to manual entry rather than showing an error wall.
    return NextResponse.json({ foods: [], error: "search_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
