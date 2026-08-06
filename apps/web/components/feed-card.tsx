"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  feedStatText,
  feedTierChip,
  fs,
  leading,
  tracking,
  type FeedDetail,
  type FeedItemView,
  type FeedStat,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";
import { C, Avatar } from "./social-ui";

/**
 * THE FEED ROW (web) — the D3 zones from reference/feed-spec.html, rendered
 * from the shared `FeedDetail` that core computes (packages/core/src/feed-card.ts)
 * so this file and its mobile twin can never drift.
 *
 * A post is a full-width ROW, not a card: no surface, no border radius, just a
 * hairline under each post (the timeline treatment). At mobile widths the row
 * bleeds under the shell's gutter (--page-pad-x) so the divider runs edge to
 * edge, matching the native app; at desktop widths it spans the feed column.
 *
 * Zones, top to bottom: A identity, B headline, C figures, D evidence,
 * E words, F actions. Every post type is a configuration of these — a PR is
 * `archetype: "stat"` (one big number and its provenance), a session is
 * `"sets"` (top sets over a stat row), a status post is `"text"`.
 *
 * The rules this file enforces visually:
 *   • ONE accent per row — the discipline sets it, everything else is chalk/ash.
 *   • Moment drives weight — a p0 PR gets the 46px figure; a p2 session does not.
 *   • Provenance sits on the FIGURE, not the name: the tier chip proves the
 *     number, the identity tick proves the person. Tier 0 wears no badge at all.
 *   • Device-measured figures carry the watch signature; typed ones carry none
 *     and no apology.
 */

const mono = "var(--font-mono)";
const display = "var(--font-display)";

/** The card's single accent. ALWAYS the AA-guarded `-text` channel: an accent
 *  used as a text/glyph colour must clear contrast on both themes (lib/ui.tsx),
 *  and a card's numbers are exactly that. */
const ACCENTS = ["lime", "blue", "violet", "amber", "red"] as const;
type CardAccent = (typeof ACCENTS)[number];
const accentVar = (accent: string): string =>
  accentText((ACCENTS as readonly string[]).includes(accent) ? (accent as CardAccent) : "lime");

export function WatchGlyph({ color }: { color?: string }) {
  const { t } = useLang();
  return (
    <svg width="11" height="13" viewBox="0 0 11 14" fill="none" stroke={color ?? C("ash")} strokeWidth="1.3" aria-label={t("feed.deviceMeasured")} role="img">
      <rect x="1.5" y="3.2" width="8" height="7.6" rx="2.4" />
      <path d="M3.5 3V1.2h4V3M3.5 11v1.8h4V11" />
    </svg>
  );
}

/** A mono uppercase chip. `tone` colours it; undefined leaves it ash. */
export function Chip({ children, tone, title }: { children: ReactNode; tone?: string; title?: string }) {
  const col = tone ? accentVar(tone) : C("ash");
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: mono,
        fontSize: fs.nano,
        fontWeight: 600,
        letterSpacing: tracking.label,
        textTransform: "uppercase",
        border: `1px solid ${tone ? `color-mix(in srgb, ${col} 50%, ${C("line")})` : C("line")}`,
        borderRadius: 999,
        padding: "4px 8px",
        color: col,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Zone C — the stat row. Device-measured cells carry the watch signature. */
function StatRow({ stats, units }: { stats: FeedStat[]; units: WeightUnit }) {
  const { t } = useLang();
  if (!stats.length) return null;
  return (
    <div style={{ display: "flex", borderTop: `1px solid ${C("line")}`, marginTop: 8, paddingTop: 8 }}>
      {stats.map((s) => (
        <div key={s.key} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: fs.note, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: s.key === "hr" ? accentVar("blue") : C("chalk") }}>
            {s.device && <WatchGlyph />}
            {feedStatText(s, units)}
          </div>
          <div style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash"), marginTop: 2 }}>
            {t(FEED_STAT_LABEL_KEY[s.key])}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Zone C — top sets. Two or three lines worth reading, never the full ledger. */
function TopSets({ sets, units }: { sets: NonNullable<FeedDetail["sets"]>; units: WeightUnit }) {
  if (!sets.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {sets.map((l, i) => (
        <div
          key={`${l.name}-${i}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            padding: "5px 0",
            borderBottom: i === sets.length - 1 ? "none" : `1px solid color-mix(in srgb, ${C("line")} 60%, transparent)`,
          }}
        >
          <span style={{ fontFamily: display, fontSize: fs.body, fontWeight: 600, color: C("chalk"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
          <span style={{ fontFamily: mono, fontSize: fs.caption, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C("chalk"), whiteSpace: "nowrap" }}>
            {l.sets} × {l.reps}
            {l.loadKg != null && <span style={{ color: C("ash") }}>{" — "}{feedFigureText(l.loadKg, units).value} {feedFigureText(l.loadKg, units).unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Zone B+C for a p0/p1 moment — the hero figure with its provenance beside it. */
function Figure({ detail, units }: { detail: FeedDetail; units: WeightUnit }) {
  const { t } = useLang();
  const tier = feedTierChip(detail.tier);
  const fig = detail.figureKg != null && detail.figureKg > 0 ? feedFigureText(detail.figureKg, units) : null;
  const e1 = detail.e1rmKg != null ? feedFigureText(detail.e1rmKg, units) : null;
  return (
    <>
      {(fig || tier) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {fig && (
            <>
              <span style={{ fontFamily: mono, fontSize: fs.stat, fontWeight: 700, lineHeight: 1, letterSpacing: tracking.display, fontVariantNumeric: "tabular-nums", color: C("chalk") }}>{fig.value}</span>
              <span style={{ fontFamily: mono, fontSize: fs.title, fontWeight: 600, color: C("ash") }}>{fig.unit}</span>
            </>
          )}
          {/* Provenance belongs to the CLAIM, so the tier chip sits on the
              figure's line — not up beside the athlete's name. */}
          {tier && (
            <span style={{ marginLeft: "auto" }}>
              <Chip tone="lime" title={t(`feed.tierExplain.${detail.tier}`)}>
                <b>{tier.short}</b> {t(tier.labelKey)}
              </Chip>
            </span>
          )}
        </div>
      )}
      {(detail.deltaPct != null || e1 || detail.firstEver) && (
        <div style={{ fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: detail.deltaPct != null ? accentVar("lime") : C("ash"), marginTop: 4 }}>
          {e1 ? t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`) : null}
          {detail.deltaPct != null && <> {feedDeltaText(detail.deltaPct)}</>}
          {detail.firstEver && <span style={{ color: C("ash"), fontWeight: 500 }}>{detail.firstEver && (e1 || detail.deltaPct != null) ? " — " : ""}{t("feed.firstEver")}</span>}
        </div>
      )}
    </>
  );
}

export interface FeedCardProps {
  item: FeedItemView;
  units: WeightUnit;
  onOpenProfile: (handle: string) => void;
  onKudos: () => void;
  onComments: () => void;
  onDelete?: () => void;
  children?: ReactNode; // the comment thread, when open
}

export default function FeedCard({ item, units, onOpenProfile, onKudos, onComments, onDelete, children }: FeedCardProps) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const d = item.detail;
  const moment = d?.moment ?? "p2";

  // The headline: core names the lift, the client speaks the language.
  const headline = d
    ? d.headlineKey === "feed.hl.session" || d.headlineKey === "feed.hl.sharedWorkout"
      ? d.headlineArg || t(d.headlineKey)
      : d.headlineArg
        ? t(d.headlineKey).replace("{lift}", d.headlineArg)
        : t(d.headlineKey)
    : item.lead || item.title;

  // Moment drives weight. A p0 record interrupts; a Tuesday session does not.
  const headlineStyle: CSSProperties =
    moment === "p0"
      ? { fontFamily: display, fontWeight: 800, fontSize: fs.headline, letterSpacing: tracking.display, lineHeight: `${leading(fs.headline, "tight")}px` }
      : { fontFamily: display, fontWeight: 800, fontSize: fs.title, lineHeight: `${leading(fs.title, "snug")}px` };

  // "Why you're seeing this" — a ranked card from someone the viewer doesn't
  // follow must be able to say why it's here, or it shouldn't be here at all.
  const reason = item.reason ? t(item.reason.key) : null;
  const meta = [item.author.handle ? `@${item.author.handle}` : null, item.when, reason].filter(Boolean) as string[];

  return (
    <article
      style={{
        padding: isMobile ? "12px var(--page-pad-x, 16px)" : "12px 0",
        margin: isMobile ? "0 calc(-1 * var(--page-pad-x, 16px))" : 0,
        borderBottom: `1px solid ${C("line")}`,
      }}
    >
      {/* ZONE A — identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="pressable" onClick={() => onOpenProfile(item.author.handle)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} aria-label={item.author.displayName ?? item.author.handle}>
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={36} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: fs.note, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.author.displayName || (item.author.handle ? `@${item.author.handle}` : t("w.social.you"))}
          </div>
          {/* A spaced en dash joins the meta line — never a middot. */}
          <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.join(" – ")}</div>
        </div>
        {item.subjectType === "post" && item.mine && onDelete && (
          <button className="pressable" onClick={onDelete} aria-label={t("w.social.deletePostAria")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {/* ZONE B — headline */}
      {headline && <div style={{ ...headlineStyle, color: C("chalk"), marginTop: 8 }}>{headline}</div>}

      {/* ZONE C — the figures */}
      {d?.archetype === "stat" && <Figure detail={d} units={units} />}
      {d?.prCount ? <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 4 }}>{t("feed.prCount").replace("{n}", String(d.prCount))}</div> : null}
      {d?.sets && d.sets.length > 0 && <TopSets sets={d.sets} units={units} />}
      {d?.stats && d.stats.length > 0 && <StatRow stats={d.stats} units={units} />}

      {/* ZONE E — words. A caption is written FOR the feed; the private session
          note is owner-only by schema and never arrives here. */}
      {item.body && <p style={{ color: moment === "p2" && d?.archetype === "text" ? C("chalk") : C("ash"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, margin: "8px 0 0" }}>{item.body}</p>}

      {/* Legacy chips — only when core had no structured detail to give. */}
      {!d && item.chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {item.chips.map((c, i) => <Chip key={i}>{c}</Chip>)}
        </div>
      )}

      {/* ZONE F — actions. No border of its own — the row's closing hairline
          is the only line a post gets, X-style. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
        <button
          className="pressable"
          onClick={onKudos}
          aria-pressed={item.kudosedByMe}
          style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: item.kudosedByMe ? accentVar("lime") : C("ash") }}
        >
          {/* The bolt, not a heart: given reads across the room. */}
          <svg width="17" height="17" viewBox="0 0 16 16" fill={item.kudosedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.8 1.5 3.6 9h3.2l-.9 5.5L11.4 7H8.1Z" />
          </svg>
          {item.kudos > 0 ? item.kudos : t("feed.kudos")}
        </button>
        <button className="pressable" onClick={onComments} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: C("ash") }}>
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M13.5 7.2c0 2.9-2.5 5-5.5 5-.7 0-1.4-.1-2-.3L2.7 13l.6-2.6a5 5 0 0 1-1.3-3.2c0-2.9 2.5-5 5.5-5s6 2.1 6 5Z" />
          </svg>
          {item.comments > 0 ? item.comments : t("w.social.comment")}
        </button>
      </div>

      {children}
    </article>
  );
}
