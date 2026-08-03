import { describe, it, expect } from "vitest";
import { makeT, makeTWithOverrides, allTranslationKeys, baselineString } from "./i18n";
import { analyticsScopesFor, analyticsScopeLabelKey, analyticsScopePrivacyKey } from "./nav";

describe("makeTWithOverrides", () => {
  it("is identical to makeT when no overrides are given", () => {
    const a = makeT("pl");
    const b = makeTWithOverrides("pl", undefined);
    for (const k of ["nav.today", "common.cancel", "does.not.exist"]) {
      expect(b(k)).toBe(a(k));
    }
  });

  it("lets an override win over the shipped string in the active language", () => {
    const t = makeTWithOverrides("en", { en: { "nav.today": "Home" } });
    expect(t("nav.today")).toBe("Home");
  });

  it("falls back through shipped active-lang → override en → shipped en → key", () => {
    // no pl override for this key, but a pl shipped value exists → shipped pl wins
    const t = makeTWithOverrides("pl", { en: { "common.cancel": "OVERRIDE-EN" } });
    expect(t("nav.today")).toBe(baselineString("pl", "nav.today"));
    // an unknown key with only an en override → en override
    const t2 = makeTWithOverrides("pl", { en: { "brand.new.key": "Hello" } });
    expect(t2("brand.new.key")).toBe("Hello");
    // an unknown key with nothing → the key itself
    expect(t2("totally.unknown")).toBe("totally.unknown");
  });

  it("exposes a stable, deduped, sorted key list including known keys", () => {
    const keys = allTranslationKeys();
    expect(keys).toContain("nav.today");
    expect(keys.length).toBe(new Set(keys).size);
    expect([...keys]).toEqual([...keys].sort());
  });
});

describe("Analytics strings are localized on every client", () => {
  // Analytics ships on BOTH web and mobile (parity rule), off the SAME keys —
  // a key that only resolves in English would leave one client half-translated.
  it("resolves every scope label + privacy note in EN/PL/DE", () => {
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const scope of analyticsScopesFor("admin")) {
        for (const key of [analyticsScopeLabelKey(scope), analyticsScopePrivacyKey(scope)]) {
          expect(t(key), `${lang}: ${key}`).not.toBe(key);
        }
      }
      expect(t("analytics.subtitle"), `${lang}: analytics.subtitle`).not.toBe("analytics.subtitle");
    }
  });

  it("keeps the dashboard body strings resolvable too (shared w.home.analytics.* bundle)", () => {
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const key of ["w.home.analytics.sessions", "w.home.analytics.clients", "w.home.analytics.totalUsers"]) {
        expect(t(key), `${lang}: ${key}`).not.toBe(key);
      }
    }
  });
});

/**
 * THE VOCABULARY GUARD.
 *
 * The design audit found three nouns for one object in shipped English copy —
 * session (296), workout (168) and training (116) — including two versions of
 * the SAME empty-state sentence on two screens, and a tab labelled "Log session"
 * leading to a settings category called "Workout logger". A user learns a
 * product's vocabulary in the first session; three words for one object teaches
 * them the product does not know its own name.
 *
 * THE VOCABULARY: a **session** is the object. **Training** is the mass noun for
 * the activity and never labels an object. **Workout** has left the interface —
 * with ONE deliberate exception below.
 */
describe("english vocabulary", () => {
  // "workout" is CORRECT for what the DEVICE recorded: it is Apple's own noun in
  // HealthKit, and device.import.lead turns the distinction into the sentence
  // that explains the feature — "Workouts your device recorded. New ones become
  // sessions". These keys are the contrast, not a lapse. A blind sweep would
  // have destroyed the one place both words are doing real work.
  const DEVICE_RECORDING = new Set([
    "session.device.matchCta",
    "session.device.rematch",
    "session.device.pickTitle",
    "session.device.none",
    "device.import.lead",
    "device.import.autoDesc",
  ]);

  it("calls the object a session everywhere but the device's own recordings", () => {
    const offenders = allTranslationKeys()
      .filter((key) => !DEVICE_RECORDING.has(key))
      .map((key) => [key, baselineString("en", key)] as const)
      .filter(([, value]) => value != null && /\bworkouts?\b/i.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(offenders).toEqual([]);
  });
});
