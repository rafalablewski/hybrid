import { describe, it, expect } from "vitest";
import { renderMergeTags, greetingName } from "./email";

describe("merge tags", () => {
  it("substitutes known tags and tolerates whitespace", () => {
    expect(renderMergeTags("Hi {{name}}, {{ email }}", { name: "Ada", email: "a@b.co" })).toBe("Hi Ada, a@b.co");
  });
  it("collapses unknown/empty tags to nothing", () => {
    expect(renderMergeTags("Hi {{name}}!", {})).toBe("Hi !");
    expect(renderMergeTags("X{{nope}}Y", { nope: null })).toBe("XY");
  });
});

describe("greetingName", () => {
  it("prefers first name, falls back to email local part", () => {
    expect(greetingName("Ada Lovelace", "x@y.z")).toBe("Ada");
    expect(greetingName(null, "ada@y.z")).toBe("ada");
    expect(greetingName("", "@y.z")).toBe("there");
  });
});
