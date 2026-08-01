/**
 * Verified Strength Record — the attestation tiers.
 *
 * Every strength number on the internet is self-reported and therefore
 * worthless as evidence; there is no strength equivalent of a verified race
 * time. This module is the shared vocabulary for fixing that: every PR carries
 * a tier saying WHAT KIND of evidence stands behind it, and the tier is
 * computed from evidence the athlete cannot simply type.
 *
 * The registry (0–5) is the full ladder from the strategy review. LIVE today
 * are tiers 0–2:
 *   0 CLAIMED   — typed into the logger. The default, and says so.
 *   1 SENSED    — the SESSION is corroborated by a device recording (Apple
 *                 Watch match: time, duration, heart rate). Honest scope: the
 *                 wearable proves the workout happened, not the barbell load —
 *                 true rep-signature sensing arrives with silent-logging, and
 *                 the label is written for what it proves today.
 *   2 WITNESSED — a second HYBRID account co-signed this specific lift. The
 *                 witness stakes their own name on the feed; co-signing is
 *                 free, social, and is itself the growth loop.
 * Tiers 3–5 (recorded / instrumented / sanctioned) are declared here so the
 * ladder is stable, and return from `prTier` only when their evidence exists.
 *
 * Pure: the server stores attestation rows, the clients render badges — both
 * read the meaning from here so a tier can never drift between surfaces.
 */
import type { LoggedSession } from "./engines/session";

export type AttestationTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface AttestationTierInfo {
  tier: AttestationTier;
  /** Stable machine key (storage, analytics). */
  key: "claimed" | "sensed" | "witnessed" | "recorded" | "instrumented" | "sanctioned";
  /** Short badge text. */
  label: string;
  /** What the tier actually proves — shown wherever the badge can be tapped. */
  evidence: string;
  /** Tiers not yet earnable in the product (no live evidence path). */
  live: boolean;
}

export const ATTESTATION_TIERS: AttestationTierInfo[] = [
  { tier: 0, key: "claimed", label: "Claimed", evidence: "Typed into the logger — no corroborating evidence.", live: true },
  { tier: 1, key: "sensed", label: "Sensed", evidence: "The session is corroborated by a matched device recording (time, duration, heart rate) — the workout happened; the load is still as typed.", live: true },
  { tier: 2, key: "witnessed", label: "Witnessed", evidence: "A second HYBRID account was there and co-signed this lift under their own name.", live: true },
  { tier: 3, key: "recorded", label: "Recorded", evidence: "On-device video with lift detection and plate count from the frame.", live: false },
  { tier: 4, key: "instrumented", label: "Instrumented", evidence: "Measured by hardware — bar sensor, force plate, or gym-mounted camera.", live: false },
  { tier: 5, key: "sanctioned", label: "Sanctioned", evidence: "An official result — federation meet, race, or combine.", live: false },
];

export const tierInfo = (tier: AttestationTier): AttestationTierInfo => ATTESTATION_TIERS[tier]!;

/** One witness request / co-sign on one lift in one session — the wire and
 *  storage shape (RecordAttestation in prisma). Append-only by convention:
 *  the claim snapshot never changes, only status moves, once. */
export interface PrAttestation {
  id: string;
  sessionId: string;
  /** The lift name EXACTLY as logged in the session's strength block. */
  lift: string;
  status: "pending" | "cosigned" | "declined";
  /** The witness's public handle, for display. */
  witnessHandle?: string | null;
  witnessName?: string | null;
  /** Claim snapshot at request time (kg) — what the witness actually signed. */
  e1rm?: number | null;
  topLoad?: number | null;
  createdAt?: string;
  respondedAt?: string | null;
}

/** The subject key an attestation anchors to (mirrors Kudos' subjectType +
 *  subjectId convention, one string because a lift name may contain spaces). */
export const prSubject = (sessionId: string, lift: string): string => `${sessionId}:${lift}`;

/**
 * The tier a PR holds RIGHT NOW, from the evidence at hand. Highest evidence
 * wins; a declined or pending request is not evidence.
 */
export function prTier(opts: {
  /** The session the PR was set in (device presence = tier 1). */
  session?: Pick<LoggedSession, "device"> | null;
  /** Attestations anchored to this session+lift. */
  attestations?: PrAttestation[] | null;
}): AttestationTier {
  const cosigned = (opts.attestations ?? []).some((a) => a.status === "cosigned");
  if (cosigned) return 2;
  if (opts.session?.device) return 1;
  return 0;
}

/** Badge + one-liner for a PR row. `pending` marks a witness request that has
 *  not been answered — shown as the tier it would become, hollow. */
export function prBadge(tier: AttestationTier, opts: { pending?: boolean } = {}): {
  label: string;
  key: AttestationTierInfo["key"];
  explain: string;
  pending: boolean;
} {
  const info = tierInfo(tier);
  return { label: info.label, key: info.key, explain: info.evidence, pending: !!opts.pending };
}
