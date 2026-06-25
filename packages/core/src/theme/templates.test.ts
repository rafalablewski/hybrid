import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  isTemplateName,
  resolveTemplate,
} from "./templates";

describe("templates registry", () => {
  it("is Aurora-only (classic was removed)", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["aurora"]);
  });

  it("defaults to aurora — the one HYBRID template", () => {
    expect(DEFAULT_TEMPLATE).toBe("aurora");
    expect(TEMPLATES.some((t) => t.id === DEFAULT_TEMPLATE)).toBe(true);
  });

  it("guards persisted values — only aurora is valid", () => {
    expect(isTemplateName("aurora")).toBe(true);
    expect(isTemplateName("classic")).toBe(false);
    expect(isTemplateName("nope")).toBe(false);
    expect(isTemplateName(undefined)).toBe(false);
  });

  it("resolves every value (incl. a stored 'classic') to aurora", () => {
    expect(resolveTemplate("aurora")).toBe("aurora");
    expect(resolveTemplate("classic")).toBe("aurora");
    expect(resolveTemplate("garbage")).toBe("aurora");
    expect(resolveTemplate(null)).toBe("aurora");
  });
});
