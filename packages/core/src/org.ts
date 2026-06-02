/**
 * Org Graph — the Team Operating System primitives.
 *
 * A club/federation runs as one governed organization: a team hierarchy
 * (first team → academy → U12), staff with roles, and access scoped by data
 * sensitivity (a strength coach sees load, not blood results). This module is
 * the pure, testable core of that: the role/permission matrix and the
 * team-tree algebra. Storage + API enforce it; the rules live here.
 */

export type OrgRole = "OWNER" | "DIRECTOR" | "COACH" | "MEDICAL" | "ANALYST" | "ATHLETE";

/** Tiers a signal/record can carry; access is granted per tier per role. */
export type DataSensitivity = "performance" | "medical" | "admin";

export const ORG_ROLES: OrgRole[] = ["OWNER", "DIRECTOR", "COACH", "MEDICAL", "ANALYST", "ATHLETE"];

/** Which sensitivity tiers each role may READ across the org's athletes. */
const READ_MATRIX: Record<OrgRole, DataSensitivity[]> = {
  OWNER: ["performance", "medical", "admin"],
  DIRECTOR: ["performance", "medical", "admin"],
  MEDICAL: ["performance", "medical"],
  COACH: ["performance"],
  ANALYST: ["performance"],
  // an athlete sees their own data (any tier) — enforced by ownership, not here
  ATHLETE: [],
};

/** Roles that can manage the org (teams, staff, roster, settings). */
const MANAGE_ROLES: OrgRole[] = ["OWNER", "DIRECTOR"];

export function canRead(role: OrgRole, tier: DataSensitivity): boolean {
  return READ_MATRIX[role].includes(tier);
}

export function canManageOrg(role: OrgRole): boolean {
  return MANAGE_ROLES.includes(role);
}

/** Human-readable summary of what a role can see, for the permissions UI. */
export function roleScope(role: OrgRole): string {
  if (role === "ATHLETE") return "Own performance + medical data only";
  const tiers = READ_MATRIX[role];
  const parts = [
    tiers.includes("performance") ? "performance" : null,
    tiers.includes("medical") ? "medical" : null,
    tiers.includes("admin") ? "admin/reporting" : null,
  ].filter(Boolean);
  const manage = canManageOrg(role) ? " · can manage teams & staff" : "";
  return `${parts.join(" + ") || "no roster access"}${manage}`;
}

// ---- team tree algebra --------------------------------------------------

export interface TeamNode {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TeamTree extends TeamNode {
  depth: number;
  children: TeamTree[];
}

/** Build the forest of team roots from a flat list (cycle-safe). */
export function buildTeamTree(teams: TeamNode[]): TeamTree[] {
  const byParent = new Map<string | null, TeamNode[]>();
  for (const t of teams) {
    const k = t.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(t);
  }
  const seen = new Set<string>();
  const build = (node: TeamNode, depth: number): TeamTree => {
    seen.add(node.id);
    const kids = (byParent.get(node.id) ?? []).filter((c) => !seen.has(c.id));
    return {
      ...node,
      depth,
      children: kids.map((c) => build(c, depth + 1)),
    };
  };
  // roots = no parent, or a parent that isn't in the set (orphan → treat as root)
  const ids = new Set(teams.map((t) => t.id));
  const roots = teams.filter((t) => t.parentId === null || !ids.has(t.parentId));
  return roots.map((r) => build(r, 0));
}

/** Flatten a tree to a depth-ordered list (for indented rendering). */
export function flattenTree(forest: TeamTree[]): TeamTree[] {
  const out: TeamTree[] = [];
  const walk = (n: TeamTree) => {
    out.push(n);
    n.children.forEach(walk);
  };
  forest.forEach(walk);
  return out;
}

/**
 * The set of team ids a member may see athlete data for, or `null` for "all".
 * Managers and unscoped staff (no team) see the whole org; a member pinned to a
 * team sees only that team's subtree. Athletes get no roster scope ([]).
 */
export function visibleTeamIds(
  role: OrgRole,
  myTeamId: string | null,
  teams: TeamNode[],
): string[] | null {
  if (role === "ATHLETE") return [];
  if (canManageOrg(role) || !myTeamId) return null;
  return teamSubtreeIds(teams, myTeamId);
}

/** Whether `role` (scoped to `myTeamId`) may see an athlete on `athleteTeamId`. */
export function canSeeAthlete(
  role: OrgRole,
  myTeamId: string | null,
  athleteTeamId: string | null,
  teams: TeamNode[],
): boolean {
  if (!canRead(role, "performance")) return false;
  const visible = visibleTeamIds(role, myTeamId, teams);
  if (visible === null) return true; // org-wide
  if (visible.length === 0) return false;
  return athleteTeamId !== null && visible.includes(athleteTeamId);
}

/** All descendant team ids of `teamId` (inclusive), for scope checks. */
export function teamSubtreeIds(teams: TeamNode[], teamId: string): string[] {
  const forest = buildTeamTree(teams);
  const find = (forest: TeamTree[]): TeamTree | null => {
    for (const n of forest) {
      if (n.id === teamId) return n;
      const f = find(n.children);
      if (f) return f;
    }
    return null;
  };
  const node = find(forest);
  if (!node) return [];
  return flattenTree([node]).map((n) => n.id);
}
