import { describe, it, expect } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("scores an empty string as an empty meter, below minimum", () => {
    const r = passwordStrength("");
    expect(r.score).toBe(0);
    expect(r.meetsMinimum).toBe(false);
  });

  it("treats anything under 8 chars as weak + below minimum", () => {
    const r = passwordStrength("Ab3$x");
    expect(r.meetsMinimum).toBe(false);
    expect(r.label).toBe("weak");
  });

  it("flags the app minimum at exactly 8 chars", () => {
    expect(passwordStrength("abcdefgh").meetsMinimum).toBe(true);
  });

  it("rewards length + character-class variety", () => {
    expect(passwordStrength("abcdefgh").score).toBeLessThan(passwordStrength("Abcd3fgh!x").score);
    expect(passwordStrength("Xq7!vLp2$wRt9#az").label).toBe("strong");
  });

  it("penalises common passwords and single-char repeats even when long", () => {
    expect(passwordStrength("password").label).toBe("weak");
    expect(passwordStrength("aaaaaaaaaaaa").label).toBe("weak");
  });

  it("never returns a score outside 0–4", () => {
    for (const pw of ["", "a", "abcdefgh", "Abcd3fgh!x", "Xq7!vLp2$wRt9#az".repeat(3)]) {
      const { score } = passwordStrength(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});
