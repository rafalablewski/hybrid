import { describe, it, expect } from "vitest";
import {
  isValidLanguage,
  normalizeRole,
  clampInt,
  clampPage,
  clampPageSize,
  evaluateRoleChange,
  redactSensitive,
  SECURITY_CONTROLS,
  securityPosture,
  SECURITY_ROLES,
} from "./security";

describe("language validation", () => {
  it("accepts only supported locales", () => {
    expect(isValidLanguage("en")).toBe(true);
    expect(isValidLanguage("pl")).toBe(true);
    expect(isValidLanguage("de")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const bad of ["EN", "fr", "", " en", "en;DROP", null, undefined, 1, {}]) {
      expect(isValidLanguage(bad as unknown)).toBe(false);
    }
  });
});

describe("normalizeRole", () => {
  it("normalizes valid roles regardless of casing", () => {
    expect(normalizeRole("admin")).toBe("ADMIN");
    expect(normalizeRole("Coach")).toBe("COACH");
    expect(normalizeRole("CLIENT")).toBe("CLIENT");
  });
  it("rejects unknown / hostile input", () => {
    for (const bad of ["superadmin", "root", "", "ADMIN ", null, undefined, 0, {}, "owner"]) {
      expect(normalizeRole(bad as unknown)).toBeNull();
    }
  });
});

describe("clampInt / pagination", () => {
  it("clamps into range and truncates", () => {
    expect(clampInt(5, 1, 10, 3)).toBe(5);
    expect(clampInt(-4, 1, 10, 3)).toBe(1);
    expect(clampInt(999, 1, 10, 3)).toBe(10);
    expect(clampInt(4.9, 1, 10, 3)).toBe(4);
  });
  it("falls back on garbage", () => {
    for (const bad of ["abc", NaN, Infinity, null, undefined, {}]) {
      expect(clampInt(bad as unknown, 1, 10, 7)).toBe(7);
    }
  });
  it("page is at least 1", () => {
    expect(clampPage("0")).toBe(1);
    expect(clampPage("-10")).toBe(1);
    expect(clampPage("3")).toBe(3);
  });
  it("pageSize can't be used to exhaust the DB", () => {
    expect(clampPageSize("1000000000")).toBe(100);
    expect(clampPageSize("1e9")).toBe(100);
    expect(clampPageSize("0")).toBe(5);
    expect(clampPageSize(undefined)).toBe(25);
    expect(clampPageSize("50")).toBe(50);
  });
});

describe("evaluateRoleChange — lockout & escalation guards", () => {
  it("allows a normal promotion", () => {
    const r = evaluateRoleChange({ currentRole: "CLIENT", requestedRole: "coach", targetIsActor: false, totalAdmins: 2 });
    expect(r).toEqual({ ok: true, nextRole: "COACH" });
  });
  it("allows demoting a non-last admin (other than self)", () => {
    const r = evaluateRoleChange({ currentRole: "ADMIN", requestedRole: "CLIENT", targetIsActor: false, totalAdmins: 3 });
    expect(r.ok).toBe(true);
  });
  it("blocks an admin demoting themselves", () => {
    const r = evaluateRoleChange({ currentRole: "ADMIN", requestedRole: "CLIENT", targetIsActor: true, totalAdmins: 5 });
    expect(r).toEqual({ ok: false, reason: "you cannot remove your own admin role" });
  });
  it("blocks demoting the last remaining admin", () => {
    const r = evaluateRoleChange({ currentRole: "ADMIN", requestedRole: "COACH", targetIsActor: false, totalAdmins: 1 });
    expect(r).toEqual({ ok: false, reason: "cannot demote the last remaining admin" });
  });
  it("rejects an invalid requested role", () => {
    const r = evaluateRoleChange({ currentRole: "CLIENT", requestedRole: "root", targetIsActor: false, totalAdmins: 2 });
    expect(r).toEqual({ ok: false, reason: "invalid role" });
  });
  it("keeping an admin as admin is fine even if last + self", () => {
    const r = evaluateRoleChange({ currentRole: "ADMIN", requestedRole: "ADMIN", targetIsActor: true, totalAdmins: 1 });
    expect(r).toEqual({ ok: true, nextRole: "ADMIN" });
  });
});

describe("redactSensitive", () => {
  it("masks sensitive keys at any depth, keeps the rest", () => {
    const out = redactSensitive({
      id: "u1",
      accessToken: "secret-abc",
      nested: { refreshToken: "r", name: "ok", apiKey: "k" },
      list: [{ password: "p", email: "e@x.com" }],
    });
    expect(out).toEqual({
      id: "u1",
      accessToken: "[redacted]",
      nested: { refreshToken: "[redacted]", name: "ok", apiKey: "[redacted]" },
      list: [{ password: "[redacted]", email: "e@x.com" }],
    });
  });
});

describe("security control registry", () => {
  it("has unique control ids", () => {
    const ids = SECURITY_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every control has the required, well-formed fields", () => {
    for (const c of SECURITY_CONTROLS) {
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.detail.length).toBeGreaterThan(10);
      expect(["pass", "todo", "manual"]).toContain(c.status);
      expect(["critical", "high", "medium", "low"]).toContain(c.severity);
    }
  });
  it("a passing control documents its evidence", () => {
    for (const c of SECURITY_CONTROLS.filter((c) => c.status === "pass")) {
      expect(c.evidence, `${c.id} should cite evidence`).toBeTruthy();
    }
  });
  it("posture math is consistent", () => {
    const p = securityPosture();
    expect(p.total).toBe(SECURITY_CONTROLS.length);
    expect(p.pass + p.todo + p.manual).toBe(p.total);
    expect(p.score).toBe(Math.round((p.pass / p.total) * 100));
    expect(p.criticalOpen).toBe(
      SECURITY_CONTROLS.filter((c) => c.severity === "critical" && c.status !== "pass").length,
    );
  });
  it("covers every critical security category", () => {
    const cats = new Set(SECURITY_CONTROLS.map((c) => c.category));
    for (const must of ["Authentication", "Authorization", "Data protection", "Audit & accountability", "Secrets"]) {
      expect(cats.has(must)).toBe(true);
    }
  });
  it("never leaves a critical authn/authz control unimplemented", () => {
    // The two non-negotiables: admin APIs + admin page must be `pass`, always.
    const must = ["authz-admin-api", "authz-admin-page", "authn-all-routes"];
    for (const id of must) {
      expect(SECURITY_CONTROLS.find((c) => c.id === id)?.status).toBe("pass");
    }
  });
  it("exposes exactly the three app roles", () => {
    expect([...SECURITY_ROLES]).toEqual(["CLIENT", "COACH", "ADMIN"]);
  });
});
