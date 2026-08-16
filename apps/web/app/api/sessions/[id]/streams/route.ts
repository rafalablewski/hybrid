import { NextResponse } from "next/server";
import {
  hrZoneSeconds,
  sanitizeSessionLaps,
  sanitizeSessionStream,
  STREAM_KINDS,
  type SessionStream,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { lapsForRecording, writeSessionStreams } from "@/lib/session-projection";
import { prisma } from "@/lib/db";

/**
 * THE RECORDING ITSELF — the second-by-second data under a workout summary.
 *
 * `Session.device` holds a DeviceWorkout: duration, distance, kcal, average and
 * peak heart rate. That is a summary, and summary-level Apple Health data is a
 * commodity — every app with the entitlement reads the same eleven numbers. The
 * shape underneath (where the heart rate went and when, the route, the laps the
 * athlete pressed, the splits that fall out of the distance series) is the part
 * a wearable company actually owns, and none of it was landing here.
 *
 * It also cannot be back-filled later from our side: only the phone can read a
 * health store, so a recording not uploaded at match time is one the athlete
 * would have to re-import by hand. This endpoint is where it lands.
 *
 * POST { streams: SessionStream[], laps?: SessionLap[], activityLabel?: string }
 *   → { streams, laps, kinds }
 *
 * Owner-only, replace-in-place (a re-import overwrites rather than stacks), and
 * DERIVING AS IT WRITES: the splits and the best efforts inside the effort are
 * computed once here and stored as rows, because the reason to keep a distance
 * series at all is that "my fastest 5 km" becomes an indexed lookup instead of a
 * scan over every recording the athlete has ever made.
 *
 * GET → { streams, laps, hrZoneSec } — the recording back, for the summary's
 * charts. `?kind=hr,route` narrows it; the arrays are large and a caller that
 * wants a route does not want three other series with it.
 */

/**
 * 4 MB. A capped stream is ~3 000 samples (core STREAM_MAX_SAMPLES), so seven
 * kinds plus laps is well under a megabyte of JSON — but the client sends the
 * RAW read and lets the server downsample, because the alternative is trusting
 * a client to have done it, and an un-downsampled 1 Hz ultra is the one payload
 * that must not be rejected outright.
 */
const MAX_BODY = 4 * 1024 * 1024;

/** Resolve the session and prove the caller owns it. */
async function ownSession(request: Request, id: string) {
  const me = await getOrCreateDbUser(request);
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true, startedAt: true, archivedAt: true, device: true },
  });
  if (!session) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (session.userId !== me.id)
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { session } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Throttled like the import path, not like the logger: a stream upload follows
  // a device match, which is rare, and the payload is the largest the API takes.
  const limited = await rateLimit(request, { key: "session-streams", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const gate = await ownSession(request, id);
  if (gate.error) return gate.error;

  const parsed = await readJsonLimited<{
    streams?: unknown;
    laps?: unknown;
    activityLabel?: unknown;
  }>(request, MAX_BODY);
  if (parsed.error) return parsed.error;

  const rawStreams = Array.isArray(parsed.data?.streams) ? parsed.data.streams : null;
  if (!rawStreams) return NextResponse.json({ error: "streams array is required" }, { status: 400 });

  // Sanitize each series on its own and DROP what doesn't survive — never a 400
  // for the batch. A watch that recorded a good heart-rate series and a broken
  // GPS track must still land the heart rate; failing the upload would cost the
  // athlete both, and there is no second chance at a recording.
  const byKind = new Map<string, SessionStream>();
  for (const raw of rawStreams.slice(0, STREAM_KINDS.length * 2)) {
    const clean = sanitizeSessionStream(raw);
    // One series per kind: a client that sends two heart-rate streams for one
    // workout is confused, and the first is as good a pick as any.
    if (clean && !byKind.has(clean.kind)) byKind.set(clean.kind, clean);
  }
  const streams = [...byKind.values()];
  if (streams.length === 0)
    return NextResponse.json({ error: "no usable streams" }, { status: 400 });

  // The device's own laps, plus the splits and best efforts derived from the
  // distance series at the activity's own distances (a pool splits at 100 m, a
  // road run at 1 km).
  const activityLabel =
    typeof parsed.data?.activityLabel === "string"
      ? parsed.data.activityLabel
      : ((gate.session.device as { activityLabel?: string } | null)?.activityLabel ?? null);
  const laps = lapsForRecording(streams, sanitizeSessionLaps(parsed.data?.laps), activityLabel);

  const written = await writeSessionStreams(gate.session, streams, laps);
  return NextResponse.json({ ...written, kinds: streams.map((s) => s.kind) }, { status: 201 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await ownSession(request, id);
  if (gate.error) return gate.error;

  const want = new URL(request.url).searchParams.get("kind");
  const kinds = want
    ? want.split(",").map((k) => k.trim()).filter((k) => STREAM_KINDS.some((s) => s === k))
    : null;

  const [rows, laps] = await Promise.all([
    prisma.sessionStream.findMany({
      where: { sessionId: id, ...(kinds?.length ? { kind: { in: kinds } } : {}) },
      orderBy: { kind: "asc" },
    }),
    prisma.sessionLap.findMany({
      where: { sessionId: id },
      orderBy: [{ kind: "asc" }, { index: "asc" }],
    }),
  ]);

  const streams = rows.map((r) => ({
    kind: r.kind,
    unit: r.unit,
    provider: r.provider,
    uuid: r.uuid,
    startedAt: r.startedAt.toISOString(),
    offsets: r.offsets,
    values: r.values,
    ...(r.kind === "route" ? { valuesB: r.valuesB } : {}),
    sampleCount: r.sampleCount,
    durationSec: r.durationSec,
    min: r.min,
    max: r.max,
    avg: r.avg,
  }));

  // Zone time is DERIVED on read, never stored, because its denominator moves:
  // the athlete's max heart rate is the highest they have ever been MEASURED
  // at, and that figure goes up the first time they race. Seconds-per-zone
  // frozen at write time would disagree with every zone chart drawn after the
  // next hard session.
  //
  // The denominator is DEMONSTRATED, not predicted: one indexed aggregate over
  // the stream table's own `max` column — a query this table exists to make
  // possible, and one that beats 220-minus-age, which is a population average
  // with a ±12 bpm standard deviation and no relationship to any individual.
  // Returned alongside so the client can say what the zones are relative to
  // rather than presenting them as physiology.
  const hr = rows.find((r) => r.kind === "hr");
  let hrZoneSec: number[] | null = null;
  let maxHrUsed: number | null = null;
  if (hr) {
    const agg = await prisma.sessionStream.aggregate({
      where: { userId: gate.session.userId, kind: "hr", archived: false },
      _max: { max: true },
    });
    maxHrUsed = agg._max.max ?? hr.max ?? null;
    if (maxHrUsed)
      hrZoneSec = hrZoneSeconds(
        {
          kind: "hr",
          startedAt: hr.startedAt.toISOString(),
          offsets: hr.offsets,
          values: hr.values,
          provider: hr.provider,
          uuid: hr.uuid,
        },
        maxHrUsed,
      );
  }

  return NextResponse.json({ streams, laps, hrZoneSec, maxHrUsed });
}
