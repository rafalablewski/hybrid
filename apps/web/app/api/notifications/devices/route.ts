import { NextResponse } from "next/server";
import { ACCOUNT_NOTIF_DEFAULTS, PUSH_PREF_KEY } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { pushConfigured } from "@/lib/push";

export const runtime = "nodejs";

/**
 * WHERE A NOTIFICATION CAN BE SENT — the device-token registration.
 *
 * The sibling route (../state) is what the athlete has SEEN; this is the other
 * half: one row per phone that has agreed to be interrupted. The mobile app
 * POSTs here on every launch where the OS permission is already granted, and
 * whenever a notification switch changes, so the row is a live mirror rather
 * than a one-time registration:
 *
 *   • the token itself rotates (a restore from backup, a reinstall, iOS's own
 *     rotation), so "register once at first grant" is how a channel goes dead
 *     without anyone noticing;
 *   • the timezone travels with the athlete, and the morning nudge is a promise
 *     about THEIR 07:00;
 *   • the three switches live in Supabase auth user_metadata, which the sender
 *     cannot read per recipient without an admin round-trip each — so the phone
 *     carries the account's answer down with it.
 *
 * DELETE unregisters (the athlete turned push off, or signed out on this
 * device). It retires the row rather than deleting it: the same phone
 * re-registers on the next launch, and the nudge's own bookkeeping — how many
 * mornings went unanswered — should survive that rather than reset itself into a
 * fresh week of prompts.
 *
 * `configured: false` is a real answer the client shows rather than hides: the
 * server has no APNs key yet, so the athlete's phone is registered and nothing
 * will arrive. Same soft-degrade shape as ../state's `synced: false` — a missing
 * PushDevice table (reference/sql-push-device.sql) answers `stored: false`
 * instead of 500-ing, so a build in front of the migration still runs.
 */

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2022" || code === "P2010";
};

/** An APNs device token is hex. 32 bytes today; Apple has said it may grow. */
const isDeviceToken = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F]{32,200}$/.test(v);

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
};

/**
 * The three switches, off the request body.
 *
 * Absent = the shipped default (all three on), never "off": a client that hasn't
 * loaded the account's metadata yet must not silently mute the channel by
 * omission. Keys are the ACCOUNT keys, so the phone sends what the athlete sees.
 */
function prefs(value: unknown): { notifyCheckin: boolean; notifyCoach: boolean; notifyCosign: boolean } {
  const v = (value ?? {}) as Record<string, unknown>;
  const on = (key: string) => (typeof v[key] === "boolean" ? (v[key] as boolean) : ACCOUNT_NOTIF_DEFAULTS[key] !== false);
  return {
    notifyCheckin: on(PUSH_PREF_KEY.checkin),
    notifyCoach: on(PUSH_PREF_KEY.coach),
    notifyCosign: on(PUSH_PREF_KEY.cosign),
  };
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{
    token?: unknown; platform?: unknown; timezone?: unknown; locale?: unknown; prefs?: unknown;
  }>(request);
  if (error) return error;

  if (!isDeviceToken(b.token)) return NextResponse.json({ error: "a hex device token is required" }, { status: 400 });
  const token = b.token.toLowerCase();
  const platform = b.platform === "android" ? "android" : "ios";
  const shared = {
    platform,
    timezone: str(b.timezone, 64),
    locale: str(b.locale, 20),
    ...prefs(b.prefs),
    // A re-register is the device saying "I am alive": clear the tombstone the
    // sender may have written after a 410, and let the next send re-learn which
    // APNs host answers (a reinstall can move a token between environments).
    retiredAt: null,
  };

  try {
    // Keyed on the TOKEN, not (user, token): a phone handed to somebody else
    // re-registers the same token under the new account, and it must not then
    // receive both athletes' notifications.
    await prisma.pushDevice.upsert({
      where: { token },
      create: { userId: me.id, token, ...shared },
      update: { userId: me.id, ...shared },
    });
    return NextResponse.json({ stored: true, configured: pushConfigured() });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ stored: false, configured: pushConfigured() });
    console.error("[push] register failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = new URL(request.url).searchParams.get("token");
  if (!isDeviceToken(token)) return NextResponse.json({ error: "a hex device token is required" }, { status: 400 });

  try {
    // Scoped to the caller: a token is not a secret, and unregistering somebody
    // else's phone by guessing one would be a denial of their notifications.
    await prisma.pushDevice.updateMany({
      where: { token: token.toLowerCase(), userId: me.id },
      data: { retiredAt: new Date() },
    });
    return NextResponse.json({ stored: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ stored: false });
    console.error("[push] unregister failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
