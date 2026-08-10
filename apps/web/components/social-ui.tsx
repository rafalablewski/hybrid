"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { fs, leading, SHARED_ELEMENTS } from "@hybrid/core";
import { useTemplate } from "@/lib/use-template";
import { useLang } from "@/lib/i18n";
import { sharedElementStyle } from "@/lib/shared-element";
import type { PersonSeed } from "@hybrid/core";

// Shared primitives for the social + marketplace screens — kept here so the
// feed, discover, leaderboard, profile and coaches screens stay consistent and
// DRY, and so each picks up the Aurora rounding from one place (the accepted
// "template-aware, not a bespoke fork" pattern, like Statistics/Notifications).

export const C = (v: string) => `var(--color-${v})`;

/** Open a person's page. The optional second argument is what the calling row
 *  ALREADY knows about them (core `seedPerson`), so the page paints the
 *  identity on its first frame instead of a spinner. */
export type OpenUser = (handle: string, card?: PersonSeed) => void;

export function useSocialTheme() {
  const aurora = useTemplate().template === "aurora";
  return {
    aurora,
    r: { card: aurora ? 24 : 12, field: aurora ? 14 : 10, pill: aurora ? 999 : 8 },
  };
}

export function card(aurora: boolean, extra?: CSSProperties): CSSProperties {
  return {
    background: C("card"),
    border: `1px solid ${C("line")}`,
    borderRadius: aurora ? 24 : 12,
    padding: 16,
    ...extra,
  };
}

export function initials(name?: string | null, handle?: string): string {
  const s = (name || handle || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function Avatar({
  url,
  name,
  handle,
  size = 40,
  shared,
}: {
  url?: string | null;
  name?: string | null;
  handle?: string;
  size?: number;
  /** This avatar is the DESTINATION of one that was armed on the way in — the
   *  same person's face, 52px in a list and 84px here. Declared statically
   *  because the destination is alone on its screen. Every avatar tags itself
   *  with its HANDLE, so a door only has to say who it is opening — see
   *  `armPerson`, which is why no list threads a ref. */
  shared?: boolean;
}) {
  const { t } = useLang();
  const flight = sharedElementStyle(SHARED_ELEMENTS.personAvatar, !!shared);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-shared-avatar={handle ?? ""} data-shared-dest={shared ? "" : undefined} src={url} alt={name || handle || t("w.social.avatarAlt")} width={size} height={size} style={{ borderRadius: 999, objectFit: "cover", background: C("ink2"), ...flight }} />;
  }
  return (
    <div
      data-shared-avatar={handle ?? ""}
      data-shared-dest={shared ? "" : undefined}
      style={{
        ...flight,
        width: size,
        height: size,
        borderRadius: 999,
        background: `linear-gradient(135deg, ${C("lime")}33, ${C("ink2")})`,
        border: `1px solid ${C("line")}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.36,
        color: C("chalk"),
        flexShrink: 0,
      }}
    >
      {initials(name, handle)}
    </div>
  );
}

export function Stars({ rating, size = 14 }: { rating: number | null; size?: number }) {
  const { t } = useLang();
  if (rating == null) return <span style={{ color: C("ash"), fontSize: size }}>{t("w.social.noReviews")}</span>;
  const full = Math.round(rating);
  return (
    <span style={{ color: C("gold"), fontSize: size, letterSpacing: 1 }} aria-label={`${rating} of 5`}>
      {"★".repeat(full)}
      <span style={{ color: C("line") }}>{"★".repeat(5 - full)}</span>{" "}
      <span style={{ color: C("ash"), fontFamily: "var(--font-mono)" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export function Pill({
  children,
  active,
  onClick,
  tone = "lime",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: string;
}) {
  return (
    <button className="pressable"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? C(tone) : C("line")}`,
        background: active ? C(tone) : "transparent",
        color: active ? C("ink") : C("chalk"),
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function Btn({
  children,
  onClick,
  tone = "lime",
  ghost,
  small,
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: string;
  ghost?: boolean;
  small?: boolean;
  disabled?: boolean;
  /** Stretch to the container. For a surface whose whole offer is ONE verb —
   *  a person's page — so the action never has to be hunted for. */
  full?: boolean;
}) {
  return (
    <button className="pressable"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "6px 12px" : "9px 16px",
        borderRadius: 999,
        border: `1px solid ${ghost ? C("line") : C(tone)}`,
        background: ghost ? "transparent" : C(tone),
        color: ghost ? C("chalk") : C("ink"),
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: small ? 12 : 13,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        width: full ? "100%" : undefined,
      }}
    >
      {children}
    </button>
  );
}

export function VerifiedTick() {
  const { t } = useLang();
  return (
    <span title={t("w.social.verifiedCoach")} style={{ color: "var(--lime-text)", fontSize: 13 }}>
      ✓
    </span>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 16px", color: C("ash") }}>
      {/* Titles read the app's heading face, empty states included (cf. the
          Endurance empty state) — a serif head under Kyoto Hour. */}
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle, color: C("chalk"), marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontFamily: "var(--font-display)", fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, maxWidth: 320, margin: "0 auto" }}>{sub}</div>}
    </div>
  );
}

/** Header for an embedded social screen (title + optional right slot). */
export function ScreenHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
      <div>
        {/* fs.headline — the rung a hand-rolled screen title lands on (scale.ts);
            24 was off the ladder entirely. Heading face, like every other head. */}
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.headline, lineHeight: `${leading(fs.headline, "snug")}px`, color: C("chalk"), margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontFamily: "var(--font-display)", color: C("ash"), fontSize: fs.body, marginTop: 4 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** A "follow / following / requested" button driven by a relation string. */
export function FollowButton({
  relation,
  onFollow,
  onUnfollow,
  busy,
}: {
  relation: string;
  onFollow: () => void;
  onUnfollow: () => void;
  busy?: boolean;
}) {
  const { t } = useLang();
  if (relation === "self") return null;
  const following = relation === "following" || relation === "friend" || relation === "close";
  if (relation === "requested") return <Btn ghost small disabled>{t("w.social.requested")}</Btn>;
  return following ? (
    <Btn ghost small onClick={onUnfollow} disabled={busy}>
      {relation === "friend" || relation === "close" ? `${t("w.social.friends")} ✓` : t("w.social.following")}
    </Btn>
  ) : (
    <Btn small onClick={onFollow} disabled={busy}>
      {relation === "follower" ? t("w.social.followBack") : t("w.social.follow")}
    </Btn>
  );
}

export async function jget<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}

export async function jsend<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

/** Local toggle helper so screens can manage simple busy state. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  return {
    busy,
    is: (k: string) => busy === k,
    run: async (k: string, fn: () => Promise<void>) => {
      setBusy(k);
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    },
  };
}
