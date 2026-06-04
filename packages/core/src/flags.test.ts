import { describe, it, expect } from "vitest";
import { evaluateFlag, evaluateFlags, flagAudienceMatches, flagValues, type FeatureFlagDef } from "./flags";

const def: FeatureFlagDef = { key: "x", label: "X", description: "", defaultEnabled: true };

describe("flagAudienceMatches", () => {
  it("admins match every audience", () => {
    for (const a of ["all", "coaches", "clients", "admins"]) expect(flagAudienceMatches(a, "ADMIN")).toBe(true);
  });
  it("scopes coaches/clients correctly", () => {
    expect(flagAudienceMatches("coaches", "COACH")).toBe(true);
    expect(flagAudienceMatches("coaches", "CLIENT")).toBe(false);
    expect(flagAudienceMatches("clients", "CLIENT")).toBe(true);
    expect(flagAudienceMatches("all", "CLIENT")).toBe(true);
  });
});

describe("evaluateFlag", () => {
  it("uses the default when there's no override", () => {
    expect(evaluateFlag(def, undefined, "CLIENT")).toBe(true);
    expect(evaluateFlag({ ...def, defaultEnabled: false }, undefined, "CLIENT")).toBe(false);
  });
  it("an override disables regardless of default", () => {
    expect(evaluateFlag(def, { enabled: false }, "CLIENT")).toBe(false);
  });
  it("an audience override scopes it", () => {
    expect(evaluateFlag(def, { audience: "coaches" }, "CLIENT")).toBe(false);
    expect(evaluateFlag(def, { audience: "coaches" }, "COACH")).toBe(true);
  });
});

describe("evaluateFlags + flagValues", () => {
  const defs: FeatureFlagDef[] = [
    { key: "a", label: "A", description: "", defaultEnabled: true },
    { key: "b", label: "B", description: "", defaultEnabled: false },
  ];
  it("maps the registry to booleans", () => {
    expect(evaluateFlags(defs, { b: { enabled: true } }, "CLIENT")).toEqual({ a: true, b: true });
  });
  it("only returns values for flags effectively on", () => {
    const vals = flagValues(defs, { a: { value: { max: 5 } }, b: { value: 9 } }, "CLIENT");
    expect(vals).toEqual({ a: { max: 5 } }); // b is off by default → its value is withheld
  });
});
