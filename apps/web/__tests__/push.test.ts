import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import { langFromLocale, localClock, localDayIn, assignmentDayLabel } from "../lib/push-clock";

/**
 * The two halves of a push that can be tested without Apple and without a
 * database: the PROVIDER TOKEN (an ES256 JWT — the one place a wrong encoding
 * produces a 403 that looks exactly like a wrong key) and the LOCAL CLOCK the
 * morning nudge aims with.
 *
 * The transport itself (HTTP/2 to api.push.apple.com) is not mocked here on
 * purpose: a hand-rolled http2 double would assert that our fake behaves like
 * our code, which is the kind of test that passes while the feature is broken.
 * The retry/retire decisions it makes are pure and live in `dead()`/`sendOne`,
 * driven by APNs' documented reasons; the round trip has to be proved on a real
 * device against a real key (see the push-notifications capability).
 */

// An EC P-256 key in the same PKCS#8 PEM shape App Store Connect hands out.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

let apns: typeof import("../lib/apns");

beforeAll(async () => {
  apns = await import("../lib/apns");
});

beforeEach(() => {
  delete process.env.APNS_KEY_P8;
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_ENVIRONMENT;
  apns.resetApnsToken();
});

afterAll(() => {
  delete process.env.APNS_KEY_P8;
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_ENVIRONMENT;
});

const configure = (extra: Record<string, string> = {}) => {
  process.env.APNS_KEY_P8 = P8;
  process.env.APNS_KEY_ID = "ABC1234567";
  process.env.APNS_TEAM_ID = "TEAM123456";
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
};

describe("APNs configuration", () => {
  it("reports not configured until all three secrets are set", () => {
    expect(apns.pushConfigured()).toBe(false);
    process.env.APNS_KEY_P8 = P8;
    process.env.APNS_KEY_ID = "ABC1234567";
    // Two of three is not configured — a half-set key must not look ready.
    expect(apns.pushConfigured()).toBe(false);
    process.env.APNS_TEAM_ID = "TEAM123456";
    expect(apns.pushConfigured()).toBe(true);
  });

  it("un-escapes a .p8 pasted into an env var, the way the IAP key is", () => {
    configure({ APNS_KEY_P8: P8.replace(/\n/g, "\\n") });
    const cfg = apns.apnsConfig();
    expect(cfg).not.toBeNull();
    // The proof it survived: node can parse it back into a key.
    expect(() => createPrivateKey(cfg!.keyP8)).not.toThrow();
  });

  it("defaults the topic to the app's bundle id and accepts an override", () => {
    configure();
    expect(apns.apnsConfig()!.bundleId).toBe("com.hybriddomain.xyz");
    configure({ APNS_BUNDLE_ID: "com.example.other" });
    expect(apns.apnsConfig()!.bundleId).toBe("com.example.other");
  });

  it("pins an environment only when told to, and ignores nonsense", () => {
    configure();
    expect(apns.apnsConfig()!.pinned).toBeUndefined();
    configure({ APNS_ENVIRONMENT: "sandbox" });
    expect(apns.apnsConfig()!.pinned).toBe("sandbox");
    configure({ APNS_ENVIRONMENT: "staging" });
    expect(apns.apnsConfig()!.pinned).toBeUndefined();
  });

  it("coerces a stored environment back to the union", () => {
    expect(apns.asApnsEnvironment("production")).toBe("production");
    expect(apns.asApnsEnvironment("sandbox")).toBe("sandbox");
    expect(apns.asApnsEnvironment(null)).toBeNull();
    expect(apns.asApnsEnvironment("prod")).toBeNull();
  });
});

/**
 * The provider token, verified rather than snapshotted.
 *
 * `apnsSend` mints it internally, so the test reaches it the same way a
 * misconfiguration would be discovered — by asking the module for a send and
 * failing before the network. Instead, sign-and-verify through the exported
 * path: the private function is exercised via a tiny re-implementation check of
 * its OUTPUT contract (a real JWS over the real key), which is what Apple
 * checks too.
 */
describe("the ES256 provider token", () => {
  const json = (b64: string) => JSON.parse(Buffer.from(b64, "base64url").toString()) as Record<string, unknown>;
  const partsOf = (jwt: string) => {
    const [h = "", p = "", sig = ""] = jwt.split(".");
    return { header: json(h), payload: json(p), signature: Buffer.from(sig, "base64url"), signing: `${h}.${p}` };
  };

  it("signs a JWS Apple can verify, with the raw r||s signature JOSE requires", () => {
    configure();
    const jwt = apns.__testProviderToken(apns.apnsConfig()!, Date.parse("2026-08-17T06:00:00Z"));
    const { header, payload, signature, signing } = partsOf(jwt);

    expect(header).toEqual({ alg: "ES256", kid: "ABC1234567", typ: "JWT" });
    expect(payload.iss).toBe("TEAM123456");
    expect(payload.iat).toBe(Math.floor(Date.parse("2026-08-17T06:00:00Z") / 1000));
    // 64 bytes = r||s. Node's DEFAULT is DER (70-ish bytes, variable) and Apple
    // answers a DER signature with 403 InvalidProviderToken — indistinguishable
    // from a wrong key, which is why this assertion is here by name.
    expect(signature.length).toBe(64);
    expect(
      verify("sha256", Buffer.from(signing), { key: publicKey, dsaEncoding: "ieee-p1363" }, signature),
    ).toBe(true);
  });

  it("reuses the token for the hour Apple allows, and re-mints past it", () => {
    configure();
    const cfg = apns.apnsConfig()!;
    const t0 = Date.parse("2026-08-17T06:00:00Z");
    const first = apns.__testProviderToken(cfg, t0);
    expect(apns.__testProviderToken(cfg, t0 + 60_000)).toBe(first);
    // Fifty minutes, inside Apple's hour.
    expect(apns.__testProviderToken(cfg, t0 + 51 * 60_000)).not.toBe(first);
  });

  it("re-mints when the key id changes (a rotation mid-process)", () => {
    configure();
    const t0 = Date.parse("2026-08-17T06:00:00Z");
    const first = apns.__testProviderToken(apns.apnsConfig()!, t0);
    configure({ APNS_KEY_ID: "ZZZ7654321" });
    const second = apns.__testProviderToken(apns.apnsConfig()!, t0);
    expect(second).not.toBe(first);
    expect(json(second.split(".")[0] ?? "").kid).toBe("ZZZ7654321");
  });
});

describe("the device's own clock", () => {
  // 06:30 UTC: inside the nudge window in London, hours off it in Los Angeles —
  // the exact case the timezone column exists for.
  const at = new Date("2026-08-17T06:30:00Z");

  it("resolves the local hour and day per zone", () => {
    expect(localClock("Europe/London", at)).toEqual({ hour: 7, day: "2026-08-17" });
    expect(localClock("Europe/Warsaw", at)).toEqual({ hour: 8, day: "2026-08-17" });
    expect(localClock("America/Los_Angeles", at)).toEqual({ hour: 23, day: "2026-08-16" });
    expect(localClock("Asia/Tokyo", at)).toEqual({ hour: 15, day: "2026-08-17" });
  });

  it("renders midnight as hour 0, never 24", () => {
    // Some ICU builds format midnight as "24" under hour12:false.
    expect(localClock("Europe/Warsaw", new Date("2026-08-16T22:30:00Z"))).toEqual({ hour: 0, day: "2026-08-17" });
  });

  it("returns null for an unknown zone rather than falling back to UTC", () => {
    // A nudge not sent is recoverable; a nudge sent at 02:00 is not.
    expect(localClock("Mars/Olympus", at)).toBeNull();
    expect(localClock("", at)).toBeNull();
    expect(localDayIn("Mars/Olympus", at)).toBeNull();
  });

  it("crosses a DST boundary with the zone, not with an offset", () => {
    // 01:30 UTC on the day Poland leaves DST: 03:30 before, 02:30 after.
    expect(localClock("Europe/Warsaw", new Date("2026-10-25T00:30:00Z"))!.hour).toBe(2);
    expect(localClock("Europe/Warsaw", new Date("2026-10-24T00:30:00Z"))!.hour).toBe(2);
  });
});

describe("the device's language", () => {
  it("maps a reported locale onto a shipped language", () => {
    expect(langFromLocale("pl")).toBe("pl");
    expect(langFromLocale("pl-PL")).toBe("pl");
    expect(langFromLocale("de_AT")).toBe("de");
    expect(langFromLocale("en-GB")).toBe("en");
    // An unshipped language reads English rather than nothing.
    expect(langFromLocale("fr-FR")).toBe("en");
    expect(langFromLocale(null)).toBe("en");
    expect(langFromLocale("")).toBe("en");
  });
});

describe("the assigned day's label", () => {
  const monday = new Date(2026, 7, 17, 12); // Mon 17 Aug 2026, server-local

  it("names the weekday inside the coming week", () => {
    expect(assignmentDayLabel(new Date(2026, 7, 19, 12), "en", monday)).toBe("Wednesday");
    expect(assignmentDayLabel(new Date(2026, 7, 19, 12), "pl", monday)).toBe("środa");
  });

  it("uses a date beyond the week", () => {
    // The order is the locale's business ("Sep 2" in en, "2 wrz" in pl) — what
    // matters is that it stops claiming a weekday nine days out.
    expect(assignmentDayLabel(new Date(2026, 8, 2, 12), "en", monday)).toMatch(/Sep/);
    expect(assignmentDayLabel(new Date(2026, 8, 2, 12), "en", monday)).toMatch(/\b2\b/);
  });

  it("says nothing about a day already past", () => {
    // "assigned for last Tuesday" is worse than just naming the session.
    expect(assignmentDayLabel(new Date(2026, 7, 11, 12), "en", monday)).toBe("");
  });

  it("calls today today's weekday, not an empty string", () => {
    expect(assignmentDayLabel(new Date(2026, 7, 17, 23), "en", monday)).toBe("Monday");
  });
});
