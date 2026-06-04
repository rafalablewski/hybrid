import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";

// Exercises the at-rest token encryption (AES-256-GCM). Sets a key in the env
// for the test, then verifies round-trip, tamper-detection, and the
// no-key/backward-compatible pass-through behavior.

const KEY = randomBytes(32).toString("base64");
let mod: typeof import("../lib/crypto");

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  mod = await import("../lib/crypto");
});
afterAll(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("token encryption at rest", () => {
  it("reports configured when a key is set", () => {
    expect(mod.isEncryptionConfigured()).toBe(true);
  });

  it("round-trips a secret and produces opaque, prefixed ciphertext", () => {
    const secret = "whoop_access_token_abc123.def456";
    const sealed = mod.encryptSecret(secret);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(mod.decryptSecret(sealed)).toBe(secret);
  });

  it("uses a fresh IV each time (ciphertext differs for the same input)", () => {
    expect(mod.encryptSecret("same")).not.toBe(mod.encryptSecret("same"));
  });

  it("detects tampering via the auth tag", () => {
    const sealed = mod.encryptSecret("important");
    const parts = sealed.split(":");
    // Flip the last base64 char of the ciphertext.
    const ct = parts[3]!;
    parts[3] = ct.slice(0, -1) + (ct.endsWith("A") ? "B" : "A");
    expect(() => mod.decryptSecret(parts.join(":"))).toThrow();
  });

  it("passes plaintext (pre-key) values through unchanged", () => {
    expect(mod.decryptSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });

  it("protectToken/revealToken handle null", () => {
    expect(mod.protectToken(null)).toBeNull();
    expect(mod.revealToken(undefined)).toBeNull();
    const sealed = mod.protectToken("t");
    expect(mod.revealToken(sealed)).toBe("t");
  });
});
