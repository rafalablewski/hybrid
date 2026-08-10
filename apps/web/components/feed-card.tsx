"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  FEED_ROW_PAD,
  feedFigureText,
  feedSharePayload,
  cardLead,
  cardQualifier,
  cardRecords,
  cardSetLines,
  feedHeadlineEarnsLead,
  feedHeadlineText,
  feedStatParts,
  feedSubjectKey,
  feedTierChip,
  fs,
  isFeedSaved,
  leading,
  tracking,
  type CardLead,
  type CardRecords,
  type FeedDetail,
  type FeedItemView,
  type FeedStat,
  type Relation,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import { runShare, toggleSavedPost, useFeedSaved } from "@/lib/feed-actions";
import { useIsMobile } from "@/lib/use-media-query";
import { C, Avatar } from "./social-ui";
import FeedMenu, { feedMenuFor } from "./feed-menu";

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
/** The app's TITLE face (globals.css): Archivo under Aurora, the Shippori
 *  Mincho serif under Kyoto Hour. Every other screen's headings read it —
 *  a post's headline is a heading, so it reads it too, or the feed is the one
 *  tab still in sans on the light theme. */
const heading = "var(--font-heading)";

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

/**
 * ZONE F's private glyphs. Hand-drawn in the SAME 16-unit box at the same 1.5
 * stroke as the bolt and the bubble beside them — the Aurora icon set is a
 * 72-unit box on its own stroke ramp, so a share icon pulled from there would
 * draw visibly lighter than the two glyphs it sits next to.
 *
 * The bookmark FILLS when saved (like the bolt does when cheered): saved state
 * has to be readable while scrolling past, not on inspection.
 */
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2.5h8v11l-4-3-4 3Z" />
    </svg>
  );
}

/** An arrow leaving a tray — the universal "take this out of here". */
function ShareGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 10.5V2.2M5.3 4.9 8 2.2l2.7 2.7" />
      <path d="M3.2 8.6v4.2c0 .4.3.7.7.7h8.2c.4 0 .7-.3.7-.7V8.6" />
    </svg>
  );
}

/** The overflow ⋯. Filled dots, not stroked circles — at 1.6px a stroked ring
 *  reads as three tiny doughnuts. */
function MoreGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.2" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="12.8" cy="8" r="1.35" />
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

/**
 * THE FOOTER — the session's aggregates, and the card's provenance.
 *
 * It used to be three equal columns, each stacking a value over an uppercase
 * label: a data TABLE, arguing with the content above it for the same
 * attention, and giving tonnage no unit at all. A session's aggregates are a
 * footnote to the record, so they read as one quiet line.
 *
 * NO SEPARATOR CHARACTER. The house rule prefers real layout to a joined
 * string, and here it is available: the figure is chalk and its unit is ash, so
 * a flex gap alone divides "50 MIN" from "5,360 KG" without a dash between them.
 *
 * The HR figure is no longer drawn in teal. On a card whose one accent is
 * already spent on the improvement, a single coloured number in the footer is
 * the only colour left and reads as emphasis it hasn't earned — the opened post
 * keeps the channel, where the figure has room to mean something.
 *
 * The TIER CHIP lives here now rather than on a record line: provenance
 * qualifies the whole post, not one lift inside it. So the footer draws
 * whenever there are stats OR a tier — a shared PR post has no aggregates and
 * must still be able to say how the claim was corroborated.
 */
function FooterLine({ stats, tier, units }: { stats: FeedStat[]; tier?: FeedDetail["tier"]; units: WeightUnit }) {
  const { t, lang } = useLang();
  const chip = feedTierChip(tier);
  if (!stats.length && !chip) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", borderTop: `1px solid ${C("line")}`, marginTop: 10, paddingTop: 9 }}>
      {stats.map((s) => {
        const p = feedStatParts(s, units, lang);
        return (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: fs.micro, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C("chalk") }}>
            {p.device && <WatchGlyph />}
            {p.value}
            <span style={{ fontSize: fs.nano, fontWeight: 400, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>
              {p.unit ?? t(p.unitKey!)}
            </span>
          </span>
        );
      })}
      {chip && (
        // ASH, not the accent. The accent is the "go" colour and it is spent on
        // the improvement; provenance is a fact about the claim, not a score.
        <span style={{ marginLeft: "auto" }}>
          <Chip title={t(`feed.tierExplain.${tier}`)}>
            <b>{chip.short}</b> {t(chip.labelKey)}
          </Chip>
        </span>
      )}
    </div>
  );
}

/** ZONE C's one qualifier — a delta in the accent or a short ash FIRST, never
 *  both and never two slots. Core decides which (`cardQualifier`). */
function Qualifier({ of }: { of: { deltaPct?: number; firstEver?: boolean } }) {
  const { t } = useLang();
  const q = cardQualifier(of);
  if (!q) return null;
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: fs.micro,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...(q.kind === "first"
          ? { letterSpacing: tracking.caps, textTransform: "uppercase" as const, color: C("ash") }
          : { color: accentVar("lime") }),
      }}
    >
      {q.kind === "delta" ? q.text : t(q.labelKey)}
    </span>
  );
}

/**
 * Zone C — THE RECORDS this workout set, listed one after another.
 *
 * A record used to be a card of its own that named the heaviest lift and
 * reduced the others to "3 PRs this session". They are lines on the workout
 * now — and the LOUDEST of them has since been promoted again, out of this list
 * and up into the hero figure (core `cardRecords`). What is left here is the
 * runner-up, and past that a count that opens (the post has all of them).
 *
 * THREE TREATMENTS ON THE LINE, not six: the lift, its figure, and ONE
 * qualifier at the far edge. The tier chip left for the footer (provenance
 * belongs to the post, not to one lift in it) and "first time trained" — a
 * lowercase sentence doing a badge's job — collapsed into the same slot as the
 * delta, which it can never collide with.
 */
function PrLines({ records, units }: { records: CardRecords; units: WeightUnit }) {
  const { t } = useLang();
  const shown = records.lines;
  const rest = records.rest;
  const total = records.shown.length + rest;
  return (
    <div style={{ marginTop: 8 }}>
      {shown.map((pr, i) => {
        const fig = feedFigureText(pr.topLoadKg, units);
        return (
          <div key={`${pr.lift}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
            <span style={{ fontFamily: display, fontWeight: 700, fontSize: fs.body, color: C("chalk"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.lift}</span>
            <span style={{ fontFamily: mono, fontSize: fs.note, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C("chalk"), whiteSpace: "nowrap" }}>
              {fig.value} <span style={{ fontSize: fs.micro, color: C("ash") }}>{fig.unit}</span>
            </span>
            <span style={{ marginLeft: "auto" }}><Qualifier of={pr} /></span>
          </div>
        );
      })}
      {rest > 0 && (
        <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{t("feed.prCount").replace("{n}", String(total))}</div>
      )}
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

/**
 * ZONE C — THE ONE BIG NUMBER. Core decides whether a card gets one and where
 * it comes from (`cardLead`); this only draws it. A record-setting SESSION now
 * reaches this treatment, which it never could while the gate read
 * `archetype === "stat"` — see the note on `cardLead`.
 */
function Figure({ lead, units }: { lead: CardLead; units: WeightUnit }) {
  const { t } = useLang();
  const fig = lead.figureKg != null && lead.figureKg > 0 ? feedFigureText(lead.figureKg, units) : null;
  const e1 = lead.e1rmKg != null ? feedFigureText(lead.e1rmKg, units) : null;
  return (
    <>
      {/* THE LIFT, as the figure's own label. On a session the headline no
          longer names anything (feedHeadlineEarnsLead), so without this the
          card would open on a bare "210" with nothing saying what was lifted.
          A shared-PR post's headline already says it and passes label: null —
          the same lift twice in one card is the noise this whole pass removes. */}
      {lead.label && (
        <div style={{ fontFamily: mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash"), marginTop: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lead.label}
        </div>
      )}
      {fig && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: lead.label ? 3 : 4 }}>
          <span style={{ fontFamily: mono, fontSize: fs.stat, fontWeight: 700, lineHeight: 1, letterSpacing: tracking.display, fontVariantNumeric: "tabular-nums", color: C("chalk") }}>{fig.value}</span>
          <span style={{ fontFamily: mono, fontSize: fs.title, fontWeight: 600, color: C("ash") }}>{fig.unit}</span>
          {/* THE ONE QUALIFIER, at the far edge of the figure's own line. The
              tier chip used to hold this slot and has gone to the footer:
              provenance qualifies the post, an improvement qualifies THIS
              number. */}
          <span style={{ marginLeft: "auto" }}><Qualifier of={lead} /></span>
        </div>
      )}
      {/* The honest second number, and only that — the delta left for the slot
          above rather than sharing this line with an estimate. */}
      {e1 && (
        <div style={{ fontFamily: mono, fontSize: fs.micro, color: C("ash"), marginTop: 4 }}>
          {t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`)}
        </div>
      )}
    </>
  );
}

/**
 * ZONE F — the actions row, EXPORTED because the individual post screen
 * (feed-post.tsx) carries the identical row. Two copies of kudos/comment/save/
 * share is how the same post comes to offer different verbs depending on
 * whether you're looking at it in the stream or on its own page.
 *
 * The two PRIVATE verbs sit at the far edge, so the row splits into what you
 * give the author (kudos, comment) and what you do for yourself. Neither
 * carries a count: a save is nobody else's business and a share isn't a score.
 */
export function FeedActions({
  item,
  headline,
  onKudos,
  onComments,
}: {
  item: FeedItemView;
  /** the row's own headline, already translated — so what you share reads like
   *  what you tapped. */
  headline: string;
  onKudos: () => void;
  onComments: () => void;
}) {
  const { t } = useLang();
  const saved = isFeedSaved(useFeedSaved(), feedSubjectKey(item));
  // "Link copied" only ever appears on a browser with no share sheet, where
  // runShare falls back to the clipboard — silence there reads as a dead button.
  const [copied, setCopied] = useState(false);
  // No border of its own — the row's closing hairline is the only line a post
  // gets, X-style.
  return (
  // FOUR GLYPHS, ONE VISUAL CLASS. Kudos and comment used to wear their names
  // while save and share stood bare, so the row read as two labelled buttons
  // plus two unexplained marks. The words are gone and a COUNT takes their
  // place — but only when there is one, because "0" beside a bolt is worse than
  // silence. The labels themselves move to the accessibility layer, where the
  // visible text had been doing that job.
  <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
    <button
      className="pressable"
      onClick={onKudos}
      aria-pressed={item.kudosedByMe}
      aria-label={t("feed.kudos")}
      title={t("feed.kudos")}
      style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: item.kudosedByMe ? accentVar("lime") : C("ash") }}
    >
      {/* The bolt, not a heart: given reads across the room. */}
      <svg width="17" height="17" viewBox="0 0 16 16" fill={item.kudosedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.8 1.5 3.6 9h3.2l-.9 5.5L11.4 7H8.1Z" />
      </svg>
      {item.kudos > 0 ? item.kudos : null}
    </button>
    <button
      className="pressable"
      onClick={onComments}
      aria-label={t("w.social.comment")}
      title={t("w.social.comment")}
      style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: C("ash") }}
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M13.5 7.2c0 2.9-2.5 5-5.5 5-.7 0-1.4-.1-2-.3L2.7 13l.6-2.6a5 5 0 0 1-1.3-3.2c0-2.9 2.5-5 5.5-5s6 2.1 6 5Z" />
      </svg>
      {item.comments > 0 ? item.comments : null}
    </button>

    {/* THE RIGHT-HAND PAIR — the two PRIVATE verbs, pushed to the far edge
        so the row splits into what you give the author (kudos, comment) and
        what you do for yourself. Neither carries a count: a save is nobody
        else's business and a share isn't a score. */}
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 14 }}>
      {copied && (
        <span style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>{t("feed.linkCopied")}</span>
      )}
      <button
        className="pressable"
        onClick={() => toggleSavedPost(item)}
        aria-pressed={saved}
        aria-label={t(saved ? "feed.unsave" : "feed.save")}
        // Saved fills in CHALK, not the accent: filled-vs-outline already
        // carries the state, and lime is spent on the PUBLIC action (the
        // bolt) — one accent per row, and a save is nobody's business.
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", color: saved ? C("chalk") : C("ash") }}
      >
        <BookmarkGlyph filled={saved} />
      </button>
      <button
        className="pressable"
        onClick={async () => {
          const r = await runShare(feedSharePayload(item, headline || item.title));
          if (r === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1800); }
        }}
        aria-label={t("feed.share")}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", color: C("ash") }}
      >
        <ShareGlyph />
      </button>
    </span>
  </div>
  );
}

export interface FeedCardProps {
  item: FeedItemView;
  units: WeightUnit;
  onOpenProfile: (handle: string) => void;
  onKudos: () => void;
  onComments: () => void;
  /** Open the post — the WHOLE workout behind this row (feed-workout.tsx).
   *  Absent for cards with no session behind them (a status post), and the
   *  content zones then aren't a button. */
  onOpen?: () => void;
  onDelete?: () => void;
  /** A change the ⋯ menu made to the AUTHOR rather than this row — a follow
   *  (every card by that person now reads differently) or a block (they leave
   *  the stream). The screen owns the list, so it applies it. */
  onAuthorChanged?: (change: { authorId: string; relation?: Relation; blocked?: boolean }) => void;
  children?: ReactNode; // the comment thread, when open
}

export default function FeedCard({ item, units, onOpenProfile, onKudos, onComments, onOpen, onDelete, onAuthorChanged, children }: FeedCardProps) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const d = item.detail;
  const moment = d?.moment ?? "p2";

  // The overflow menu (zone A, right). The two PRIVATE verbs live in
  // FeedActions, which the post screen renders too.
  const [menu, setMenu] = useState(false);
  const menuRows = feedMenuFor({ mine: item.mine, subjectType: item.subjectType, canDelete: !!onDelete });

  // LONG-PRESS opens the same menu — the web half of the mobile trial (the
  // system ContextMenu on iOS 26; capabilities `context-menu-previews`), so
  // the gesture cannot exist on one client only. Hold the row ~half a second
  // without moving and the ⋯ menu opens; any drift past a thumb-wobble (8px)
  // is a scroll, not a hold, and cancels. The click that ends a completed hold
  // is swallowed in capture so it cannot also open the post underneath.
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancelHold = () => { if (hold.current) { window.clearTimeout(hold.current.timer); hold.current = null; } };
  const startHold = (e: ReactPointerEvent) => {
    if (menuRows.length === 0 || menu || !e.isPrimary) return;
    cancelHold();
    const timer = window.setTimeout(() => { held.current = true; hold.current = null; setMenu(true); }, 500);
    hold.current = { timer, x: e.clientX, y: e.clientY };
  };
  const moveHold = (e: ReactPointerEvent) => {
    if (hold.current && (Math.abs(e.clientX - hold.current.x) > 8 || Math.abs(e.clientY - hold.current.y) > 8)) cancelHold();
  };
  const swallowHeldClick = (e: ReactMouseEvent) => {
    if (held.current) { held.current = false; e.preventDefault(); e.stopPropagation(); }
  };

  // The headline: core names the lift, the client speaks the language. It is
  // still COMPOSED for every card — the share payload and the opened post both
  // need it. What changed is whether ZONE B draws it: core answers that
  // (feedHeadlineEarnsLead), so an auto "Afternoon workout" stops being the
  // largest type on twenty consecutive rows.
  const headline = feedHeadlineText(item, t);
  const leadsWithHeadline = feedHeadlineEarnsLead(item);
  const lead = cardLead(d);
  const records = cardRecords(d);
  const setLines = cardSetLines(d?.sets, records.shown);

  // Moment drives weight. A p0 record interrupts; a Tuesday session does not.
  //
  // ONE loud thing per card. A p0 that carries a hero figure sets its headline
  // at the ordinary title rung: the number is the moment, and a display-weight
  // heading above a 46px figure is two heroes arguing. A p0 with no figure —
  // some future archetype that leads with words — still gets the big rung.
  const headlineStyle: CSSProperties =
    moment === "p0" && !lead
      ? { fontFamily: heading, fontWeight: 800, fontSize: fs.headline, letterSpacing: tracking.display, lineHeight: `${leading(fs.headline, "tight")}px` }
      : { fontFamily: heading, fontWeight: 800, fontSize: fs.title, lineHeight: `${leading(fs.title, "snug")}px` };

  // "Why you're seeing this" — a ranked card from someone the viewer doesn't
  // follow must be able to say why it's here, or it shouldn't be here at all.
  // It rides ABOVE the row as a kicker: identity is one line now, and the
  // reason is about the FEED's choice, not about the person.
  const reason = item.reason ? t(item.reason.key) : null;
  const handle = item.author.handle ? `@${item.author.handle}` : null;

  return (
    <article
      onPointerDown={startHold}
      onPointerMove={moveHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClickCapture={swallowHeldClick}
      style={{
        // At mobile widths the row bleeds under the shell's gutter
        // (--page-pad-x, 12px — the app-wide side inset) so the divider runs
        // edge to edge with content still on the column.
        //
        // The VERTICAL value is a function of the row's MOMENT (core
        // FEED_ROW_PAD): a p0 opens up, a p2 tightens, and the difference
        // between them is the ranking expressed as rhythm rather than as order.
        // Both clients read the same map.
        padding: isMobile
          ? `${FEED_ROW_PAD[moment]}px var(--page-pad-x, 12px)`
          : `${FEED_ROW_PAD[moment]}px 0`,
        margin: isMobile ? "0 calc(-1 * var(--page-pad-x, 12px))" : 0,
        borderBottom: `1px solid ${C("line")}`,
      }}
    >
      {/* "Why you're seeing this" — a kicker over the row, because it is the
          feed explaining ITSELF, not a fact about the athlete. */}
      {reason && (
        <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</div>
      )}

      {/* ZONE A — identity, ONE line: avatar, name, handle, time. The name and
          the handle are the parts that can be any length, so they are the parts
          that shrink (the handle first — a name is what you recognise); the
          timestamp never shrinks and never wraps, so a post always says when. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="pressable" onClick={() => onOpenProfile(item.author.handle)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }} aria-label={item.author.displayName ?? item.author.handle}>
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={36} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: display, fontWeight: 700, fontSize: fs.note, color: C("chalk"), minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.author.displayName || handle || t("w.social.you")}
          </span>
          {/* The handle only earns its own slot when the name isn't already it. */}
          {handle && item.author.displayName ? (
            <span style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), minWidth: 0, flexShrink: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</span>
          ) : null}
          {item.when && (
            // A spaced en dash divides the two ash figures — never a middot.
            // (Flex gaps alone can't: handle and time are the same face and
            // colour, so with only space between them they read as one string.)
            <span style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), flexShrink: 0, whiteSpace: "nowrap" }}>
              {(handle && item.author.displayName) ? <span aria-hidden="true">– </span> : null}{item.when}
            </span>
          )}
        </div>
        {/* ZONE A, right — the overflow menu. This corner used to hold a bare ×
            on your own posts: an unlabelled destructive control, and nothing at
            all on everyone else's, so the stream had no answer to "I don't want
            to see this". Delete now lives INSIDE the menu, labelled and
            explained. Drawn only when the menu would have rows (core decides —
            my own session/PR row has nothing to offer). */}
        {menuRows.length > 0 && (
          // The ANCHOR. The menu is a small card hanging off this glyph's
          // bottom-right (feed-menu.tsx), so the button needs a positioned box
          // to hang from — and a stacking context, or the next post in the
          // stream paints over an open menu.
          <div style={{ position: "relative", zIndex: menu ? 30 : "auto", display: "inline-flex" }}>
            <button
              className="pressable"
              onClick={() => setMenu((v) => !v)}
              aria-label={t("feed.menu.title")}
              aria-haspopup="menu"
              aria-expanded={menu}
              style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), padding: 4, display: "inline-flex" }}
            >
              <MoreGlyph />
            </button>
            <FeedMenu
              open={menu}
              onClose={() => setMenu(false)}
              handle={item.author.handle}
              authorId={item.author.id}
              mine={item.mine}
              subjectType={item.subjectType}
              subjectId={item.subjectId}
              relation={item.relation}
              onDelete={onDelete}
              onAuthorChanged={onAuthorChanged}
            />
          </div>
        )}
      </div>

      {/* ZONES B–E are ONE target: the post opens to the whole workout behind
          it (the top sets are a preview, not the session). The actions row
          below stays outside it, so a kudos is never an accidental open. */}
      <div
        {...(onOpen
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": t("feed.open"),
              onClick: onOpen,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
              },
              style: { cursor: "pointer" },
            }
          : {})}
      >
        {/* ZONE B — the headline, drawn only when it earns the card's loudest
            line. A title the CLOCK wrote is not a headline (core decides). */}
        {leadsWithHeadline && headline && <div style={{ ...headlineStyle, color: C("chalk"), marginTop: 8 }}>{headline}</div>}

        {/* ZONE C — the figures. The hero first: a shared PR's own number, or
            the loudest record a session set. */}
        {lead && <Figure lead={lead} units={units} />}
        {/* …then the runner-up records, without the one the hero took. */}
        {(records.lines.length > 0 || records.rest > 0) && <PrLines records={records} units={units} />}
        {/* The lifts the records above already named are dropped from the top
            sets — the same lift twice in one card is noise (core cardSetLines). */}
        {setLines.length > 0 && <TopSets sets={setLines} units={units} />}
        {/* The footer draws for a tier alone, so a shared PR post with no
            aggregates can still say how its claim was corroborated. */}
        <FooterLine stats={d?.stats ?? []} tier={d?.tier} units={units} />

        {/* ZONE E — words. A caption is written FOR the feed; the private session
            note is owner-only by schema and never arrives here. */}
        {item.body && <p style={{ color: moment === "p2" && d?.archetype === "text" ? C("chalk") : C("ash"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, margin: "8px 0 0" }}>{item.body}</p>}
      </div>

      {/* Legacy chips — only when core had no structured detail to give. */}
      {!d && item.chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {item.chips.map((c, i) => <Chip key={i}>{c}</Chip>)}
        </div>
      )}

      <FeedActions item={item} headline={headline || item.title} onKudos={onKudos} onComments={onComments} />

      {children}
    </article>
  );
}
