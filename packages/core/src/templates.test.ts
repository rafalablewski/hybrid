import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  isTemplateName,
  resolveTemplate,
} from "./templates";

describe("templates registry", () => {
  it("has both templates with unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain("classic");
    expect(ids).toContain("aurora");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to classic so existing users are untouched", () => {
    expect(DEFAULT_TEMPLATE).toBe("classic");
    expect(TEMPLATES.some((t) => t.id === DEFAULT_TEMPLATE)).toBe(true);
  });

  it("guards persisted values", () => {
    expect(isTemplateName("aurora")).toBe(true);
    expect(isTemplateName("classic")).toBe(true);
    expect(isTemplateName("nope")).toBe(false);
    expect(isTemplateName(undefined)).toBe(false);
  });

  it("resolves unknown values to the default", () => {
    expect(resolveTemplate("aurora")).toBe("aurora");
    expect(resolveTemplate("garbage")).toBe(DEFAULT_TEMPLATE);
    expect(resolveTemplate(null)).toBe(DEFAULT_TEMPLATE);
  });
});
