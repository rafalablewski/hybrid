"use client";

import { accentText } from "@/lib/ui";
import { useEffect, useState } from "react";
import {
  canEnrolProgram,
  canReviewCoach,
  feedSubjectKey,
  fs,
  leading,
  tracking,
  followsUser,
  canCompareWith,
  peekPerson,
  resolveUserPageTab,
  userPageAction,
  userPageRelation,
  userPageTabs,
  userShare,
  LEVEL_KEY,
} from "@hybrid/core";
import type {
  CompareResponse,
  CompareResult,
  FeedItemView,
  KudosResponse,
  MutationResult,
  PersonCard,
  PeopleTab,
  ProgramPreviewDay,
  ProgramPreviewItem,
  ProgramPreviewWeek,
  Relation,
  SharedLift,
  StorefrontProgram,
  StorefrontReview,
  UserPagePeopleResponse,
  UserPageResponse,
  UserPageTabId,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { HeroAccessory, HeroScreen } from "./aurora/hero";
import {
  C, useSocialTheme, card, Avatar, Btn, EmptyState, Stars, VerifiedTick, jget, jsend, useBusy,
} from "./social-ui";
import FeedCard from "./feed-card";
import { Comments } from "./feed-comments";

/**
 * THE INDIVIDUAL USER PAGE (web) — twin of apps/mobile/app/u/[handle].tsx.
 *
 * One page per person. It replaced two peeks that disagreed about the same
 * human — the profile drawer (who they are) and the coach storefront (what they
 * sell) — and the difference is the same one the post screen made over its
 * sheet:
 *   • a drawer had no address. This is `?s=user&u=<handle>` (core
 *     `userPageHref`), so a person can be linked, bookmarked and landed on.
 *   • a drawer could only open a handle the current screen had already loaded.
 *     This fetches the person (/api/social/user/[handle]), so a link works for
 *     someone who has never scrolled past them.
 *   • a coach was two half-people. Here COACHING IS A TAB — the same head, the
 *     same stats, the same activity as any athlete, plus what only a coach has.
 *
 * Which tabs exist, which actions the viewer gets, and who may review or enrol
 * are all decided in core (user-page.ts), so this file and the mobile screen
 * cannot drift into two different rulebooks.
 */

const heading = "var(--font-heading)";
const mono = "var(--font-mono)";

/** The training-level badge. Same palette ramp as the owner's own chip in
 *  aurora/profile.tsx — ash and chalk for the lower tiers, the lime accent-text
 *  tone for advanced, gold reserved for elite. */
function LevelChip({ level }: { level: NonNullable<UserPageResponse["fitnessLevel"]> }) {
  const { t } = useLang();
  const ink = level.accent === "gold" ? C("gold")
    : level.accent === "lime" ? accentText("lime")
    : level.accent === "chalk" ? C("chalk") : C("ash");
  return (
    <span style={{
      // fs.nano is the floor: there is no rung below it, and this is the mono +
      // uppercase + tracked kicker — the least legible combination available.
      fontFamily: mono, fontSize: fs.nano, fontWeight: 700, letterSpacing: tracking.label,
      textTransform: "uppercase", border: `1px solid ${ink}`, color: ink,
      borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap",
    }}>
      {t(LEVEL_KEY[level.level])}
    </span>
  );
}

/** A labelled figure. Counts and training stats read the same way, because on a
 *  person's page they are the same kind of fact about them. */
function Figure({ value, label, onClick }: { value: string; label: string; onClick?: () => void }) {
  const body = (
    <>
      <div style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.subtitle, color: C("chalk") }}>{value}</div>
      <div style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C("ash"), marginTop: 2 }}>{label}</div>
    </>
  );
  const box = { flex: 1, textAlign: "center" as const, padding: "10px 6px" };
  if (!onClick) return <div style={box}>{body}</div>;
  return (
    <button className="pressable" onClick={onClick} style={{ ...box, background: "none", border: "none", cursor: "pointer" }}>
      {body}
    </button>
  );
}

/** THE DOOR AT THE END OF A LIST — it GROWS the list in place, so it takes the
 *  app's expander grammar: a bare ＋, in ash, with no ring and no arrow. An
 *  arrow would promise a destination; there isn't one, there is just more of
 *  what you are already reading. (CLAUDE.md, the exit grammar.) */
function LoadMore({ label, busy, busyLabel, onLoad }: { label: string; busy: boolean; busyLabel: string; onLoad: () => void }) {
  return (
    <button
      className="pressable"
      onClick={onLoad}
      disabled={busy}
      style={{ display: "block", width: "100%", marginTop: 14, background: "none", border: "none", padding: "6px 0", cursor: busy ? "default" : "pointer", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, textAlign: "center" }}
    >
      {busy ? busyLabel : `＋ ${label}`}
    </button>
  );
}

/** The quiet line at the true end of a list. Only shown when the end is OURS
 *  rather than theirs — "no more we can reach" is a different claim from "no
 *  more exist", and the page should not let the reader confuse them. */
function ListEnd({ text }: { text: string }) {
  return (
    <p style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C("ash"), textAlign: "center", padding: "14px 0 4px" }}>
      {text}
    </p>
  );
}

/* ── PEOPLE ───────────────────────────────────────────────────────────────── */

/** Who follows them, and who they follow. Rows carry no follow button of their
 *  own: a row opens the person, and acting on a person happens on their page,
 *  where the one button lives. */
function People({ handle, tab, onTab, onOpenUser }: {
  handle: string;
  tab: PeopleTab;
  onTab: (t: PeopleTab) => void;
  onOpenUser?: (handle: string) => void;
}) {
  const { t } = useLang();
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const url = (c?: string | null) =>
    `/api/social/user/${encodeURIComponent(handle)}/people?tab=${tab}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`;

  useEffect(() => {
    let alive = true;
    setPeople(null); setCursor(null);
    jget<UserPagePeopleResponse>(url())
      .then((d) => { if (alive) { setPeople(d.people ?? []); setCursor(d.nextCursor ?? null); } })
      .catch(() => { if (alive) { setPeople([]); setCursor(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, tab]);

  // APPEND, never replace: the rows you already read stay put, and the cursor
  // guarantees the next page starts exactly where this one stopped.
  const loadMore = async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const d = await jget<UserPagePeopleResponse>(url(cursor));
      setPeople((prev) => [...(prev ?? []), ...(d.people ?? [])]);
      setCursor(d.nextCursor ?? null);
    } finally {
      setMore(false);
    }
  };

  const side = (id: PeopleTab, label: string) => (
    <button
      className="pressable"
      onClick={() => onTab(id)}
      aria-pressed={tab === id}
      style={{
        background: "none", border: "none", padding: "0 0 8px", cursor: "pointer",
        fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase",
        color: tab === id ? C("chalk") : C("ash"),
        borderBottom: `1px solid ${tab === id ? C("chalk") : "transparent"}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 18, marginBottom: 6 }}>
        {side("followers", t("w.user.followers"))}
        {side("following", t("w.user.following"))}
      </div>
      {!people ? (
        <EmptyState title={t("common.loading")} />
      ) : people.length === 0 ? (
        <EmptyState title={t(tab === "followers" ? "w.user.noFollowers" : "w.user.noFollowing")} />
      ) : (
        <>
          {people.map((c: PersonCard) => (
            <button
              className="pressable"
              key={c.userId}
              onClick={() => onOpenUser?.(c.handle)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "10px 0", background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, cursor: "pointer" }}
            >
              <Avatar url={c.avatarUrl} name={c.displayName} handle={c.handle} size={38} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: C("chalk"), fontSize: fs.body, fontWeight: 600 }}>{c.displayName || `@${c.handle}`}</span>
                <span style={{ display: "block", color: C("ash"), fontFamily: mono, fontSize: fs.nano }}>@{c.handle}</span>
              </span>
            </button>
          ))}
          {cursor && <LoadMore label={t("w.user.loadMorePeople")} busy={more} busyLabel={t("w.user.loading")} onLoad={loadMore} />}
        </>
      )}
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "22px 0 10px" }}>
      <span style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.subtitle, color: C("chalk") }}>{title}</span>
      {meta && <span style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C("ash") }}>{meta}</span>}
    </div>
  );
}

export default function UserPage({
  handle,
  onBack,
  onOpenUser,
  onOpenPost,
}: {
  handle: string;
  onBack?: () => void;
  /** Another person reached FROM this page (a review's author) — the same page,
   *  one handle over. */
  onOpenUser?: (handle: string) => void;
  onOpenPost?: (key: string, item?: FeedItemView) => void;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [data, setData] = useState<UserPageResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<UserPageTabId>("overview");
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [peopleTab, setPeopleTab] = useState<PeopleTab>("followers");
  // The timeline pages independently of the rest of the payload: page 1 arrives
  // with the person, older pages arrive one door-press at a time.
  const [older, setOlder] = useState(false);
  const busy = useBusy();
  // What the row that opened us already knew (core/person-seed.ts). It paints
  // the identity on the FIRST frame; the fetch confirms it a moment later.
  const seed = peekPerson(handle);

  const load = async () => {
    const d = await jget<UserPageResponse>(`/api/social/user/${encodeURIComponent(handle)}`);
    if (d?.error || !d?.profile) { setFailed(true); return; }
    setFailed(false);
    setData(d);
  };
  useEffect(() => { setData(null); setCompare(null); load(); /* eslint-disable-next-line */ }, [handle]);

  const p = data?.profile;
  const rel = data ? userPageRelation(data) : "none";
  const tabs = data ? userPageTabs(data) : [];
  const shown = resolveUserPageTab(tabs, tab);

  const doFollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "POST", { handle }); await load(); });
  const doUnfollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "DELETE", { handle }); await load(); });
  const runCompare = () => busy.run("c", async () => {
    const r = await jget<CompareResponse>(`/api/social/compare?handle=${encodeURIComponent(handle)}`);
    setCompare(r.compare ?? null);
  });
  const doShare = async () => {
    if (!p) return;
    const s = userShare(p);
    if (navigator.share) { try { await navigator.share(s); return; } catch { /* dismissed */ } }
    try { await navigator.clipboard.writeText(s.url); alert(t("w.user.linkCopied")); } catch { /* no clipboard */ }
  };
  /** A kudos must never wait on the network to look given; the server's own
   *  count lands a moment later. */
  const cheer = async (item: FeedItemView) => {
    const patch = (fn: (x: FeedItemView) => FeedItemView) =>
      setData((d) => (d ? { ...d, activity: d.activity.map((x) => (x.id === item.id ? fn(x) : x)) } : d));
    patch((x) => ({ ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe }));
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    patch((x) => ({ ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe }));
  };
  /** APPEND the next page of their timeline. The cursor is the server's, so the
   *  page continues exactly where the last one stopped even if they have
   *  trained since. */
  const loadOlder = async () => {
    if (!data?.activityCursor || older) return;
    setOlder(true);
    try {
      const d = await jget<{ items: FeedItemView[]; nextCursor: string | null; capped: boolean }>(
        `/api/social/user/${encodeURIComponent(handle)}/activity?cursor=${encodeURIComponent(data.activityCursor)}`,
      );
      setData((prev) => (prev ? {
        ...prev,
        activity: [...prev.activity, ...(d.items ?? [])],
        activityCursor: d.nextCursor ?? null,
        activityCapped: d.capped ?? prev.activityCapped,
      } : prev));
    } finally {
      setOlder(false);
    }
  };
  const doBlock = () => {
    if (!window.confirm(t("w.social.blockConfirm").replace("{h}", handle))) return;
    busy.run("b", async () => { await jsend("/api/social/block", "POST", { handle }); onBack?.(); });
  };
  const doReport = () => {
    if (!p?.userId) return;
    if (!window.confirm(t("w.social.reportConfirm").replace("{h}", handle))) return;
    busy.run("r", async () => {
      await jsend("/api/reports", "POST", { targetType: "socialProfile", targetId: p.userId, reason: "inappropriate" });
      alert(t("w.social.reportThanks"));
    });
  };

  const name = p?.displayName || seed?.displayName || `@${p?.handle ?? handle}`;
  const hero = { rank: "title" as const, title: name, eyebrow: `@${p?.handle ?? handle}` };

  if (failed) {
    return (
      <HeroScreen hero={{ rank: "title", title: `@${handle}` }} back={onBack} backLabel={t("common.back")}>
        <EmptyState title={t("w.user.missing")} sub={t("w.user.missingSub")} />
      </HeroScreen>
    );
  }
  if (!data || !p) {
    // A row handed us the identity on the way in, so paint the person rather
    // than a spinner where the person will be.
    return (
      <HeroScreen hero={hero} back={onBack} backLabel={t("common.back")}>
        {seed ? (
          <div style={{ display: "flex", gap: 16, alignItems: "center", maxWidth: 640 }}>
            <Avatar url={seed.avatarUrl} name={seed.displayName} handle={seed.handle} size={84} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{name}</div>
              <div style={{ color: C("ash"), fontFamily: mono, fontSize: fs.caption }}>@{seed.handle}</div>
            </div>
          </div>
        ) : (
          <EmptyState title={t("common.loading")} />
        )}
      </HeroScreen>
    );
  }

  const action = userPageAction(data);
  const coach = data.coach;

  return (
    <HeroScreen
      hero={hero}
      back={onBack}
      backLabel={t("common.back")}
      /* SHARE lives in the rail's trailing slot — the app's own home for a
         screen-level utility, and where every OS the app ships on puts it. It
         used to be a fourth button in a row of four, which is how a page ends
         up with no centre. */
      accessory={<HeroAccessory label={t("w.user.share")} onClick={doShare} onDark={false} />}
    >
      <div style={{ maxWidth: 640 }}>
        {/* ── WHO ── the person, at the size a page allows. */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={84} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{name}</span>
              {p.coachVerified && <VerifiedTick />}
              {/* The earned level, as one word. Server-side it sits behind the
                  same privacy gate as the stats, so a private account's level
                  never reaches this client at all. */}
              {data.fitnessLevel && <LevelChip level={data.fitnessLevel} />}
            </div>
            <div style={{ color: C("ash"), fontFamily: mono, fontSize: fs.caption }}>@{p.handle}</div>
            {coach?.headline && (
              <div style={{ color: accentText("lime"), fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, marginTop: 6 }}>{coach.headline}</div>
            )}
          </div>
        </div>

        {p.bio && <p style={{ color: C("chalk"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, marginTop: 14 }}>{p.bio}</p>}

        {/* ── THE COUNTS ── who they reach, and how much they train. The
            sessions figure only appears when the results gate is open; the
            follow counts are public on every social product and stay. */}
        <div style={{ display: "flex", marginTop: 14, borderTop: `1px solid ${C("line")}`, borderBottom: `1px solid ${C("line")}` }}>
          {/* The two follow counts OPEN the list they count — the gesture every
              social product has taught. They select the People tab rather than
              pushing a screen, so a person still has exactly one address. */}
          <Figure
            value={data.counts.followers.toLocaleString()}
            label={t("w.user.followers")}
            onClick={data.canViewResults ? () => { setPeopleTab("followers"); setTab("people"); } : undefined}
          />
          <Figure
            value={data.counts.following.toLocaleString()}
            label={t("w.user.following")}
            onClick={data.canViewResults ? () => { setPeopleTab("following"); setTab("people"); } : undefined}
          />
          {data.stats && <Figure value={data.stats.totalSessions.toLocaleString()} label={t("w.social.statSessions")} />}
        </div>

        {/* ── THE ONE BUTTON ── full width, because a page with one action
            should not make you look for it. Core decides which verb it is. */}
        {action && (
          <div style={{ marginTop: 14 }}>
            <Btn
              ghost={!action.primary}
              onClick={action.id === "follow" ? doFollow : action.id === "unfollow" ? doUnfollow : undefined}
              disabled={busy.is("f") || action.id === "requested"}
              full
            >
              {action.id === "unfollow" ? `${t(action.labelKey)} ✓` : t(action.labelKey)}
            </Btn>
          </div>
        )}

        {/* ── THE TABS ── navigation, and therefore NOT buttons: text on a
            rule, with the accent under the one you're on. They used to be
            pills sitting under a row of pills, which made a field of seven
            equal-looking controls out of two different kinds of thing. */}
        {tabs.length > 1 && (
          <div role="tablist" style={{ display: "flex", gap: 22, marginTop: 20, borderBottom: `1px solid ${C("line")}` }}>
            {tabs.map((x) => {
              const on = shown === x.id;
              return (
                <button
                  key={x.id}
                  role="tab"
                  aria-selected={on}
                  className="pressable"
                  onClick={() => setTab(x.id)}
                  style={{
                    background: "none", border: "none", padding: "0 0 10px", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontSize: fs.body, fontWeight: on ? 700 : 500,
                    color: on ? C("chalk") : C("ash"),
                    borderBottom: `2px solid ${on ? C("lime") : "transparent"}`,
                    marginBottom: -1,
                  }}
                >
                  {t(x.labelKey)}
                </button>
              );
            })}
          </div>
        )}

        {shown === "overview" && (
          <Overview data={data} compare={compare} name={name} onCompare={runCompare} busy={busy.is("c")} />
        )}

        {shown === "coaching" && coach && (
          <Coaching data={data} handle={handle} onReload={load} onOpenUser={onOpenUser} />
        )}

        {shown === "activity" && (
          data.activity.length === 0 ? (
            <EmptyState title={t("w.user.noActivity")} sub={t("w.user.noActivitySub").replace("{n}", name)} />
          ) : (
            <div style={{ marginTop: 12 }}>
              {data.activity.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  units={units}
                  // Their own avatar on their own page goes nowhere — it is
                  // already here.
                  onOpenProfile={(h) => { if (h && h !== p.handle) onOpenUser?.(h); }}
                  onKudos={() => cheer(item)}
                  onComments={() => setThread(thread === item.id ? null : item.id)}
                  onOpen={onOpenPost ? () => { setThread(null); onOpenPost(feedSubjectKey(item), item); } : undefined}
                  onAuthorChanged={({ blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) => { if (blocked) onBack?.(); }}
                >
                  {thread === item.id && (
                    <Comments item={item} onCount={(n) => setData((d) => (d ? { ...d, activity: d.activity.map((x) => (x.id === item.id ? { ...x, comments: n } : x)) } : d))} />
                  )}
                </FeedCard>
              ))}
              {/* More to read → the door. Nothing more → say WHY it stopped,
                  but only when the stop is ours: a timeline that simply ran out
                  of workouts is allowed to just end. */}
              {data.activityCursor
                ? <LoadMore label={t("w.user.loadOlder")} busy={older} busyLabel={t("w.user.loading")} onLoad={loadOlder} />
                : data.activityCapped
                  ? <ListEnd text={t("w.user.activityCapped").replace("{n}", String(data.activity.length))} />
                  : null}
            </div>
          )
        )}

        {shown === "people" && (
          <People handle={handle} tab={peopleTab} onTab={setPeopleTab} onOpenUser={onOpenUser} />
        )}

        {/* ── THE QUIET VERBS ── report and block, at the foot of the page,
            never beside the ones you're meant to use. */}
        {rel !== "self" && (
          <div style={{ display: "flex", gap: 16, marginTop: 24, borderTop: `1px solid ${C("line")}`, paddingTop: 14 }}>
            <button className="pressable" onClick={doReport} disabled={busy.is("r")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: fs.caption, fontFamily: "var(--font-display)" }}>⚐ {t("w.social.report")}</button>
            <button className="pressable" onClick={doBlock} disabled={busy.is("b")} style={{ background: "none", border: "none", cursor: "pointer", color: accentText("red"), fontSize: fs.caption, fontFamily: "var(--font-display)" }}>⊘ {t("w.social.block")}</button>
          </div>
        )}
      </div>
    </HeroScreen>
  );
}

/* ── OVERVIEW ─────────────────────────────────────────────────────────────── */

function Overview({ data, compare, name, onCompare, busy }: {
  data: UserPageResponse;
  compare: CompareResult | null;
  name: string;
  onCompare: () => void;
  busy: boolean;
}) {
  const { t } = useLang();
  const stats = data.stats;

  if (!data.canViewResults) {
    const rel = userPageRelation(data);
    return (
      <div style={{ marginTop: 16, padding: 16, background: C("ink2"), borderRadius: 14, color: C("ash"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px` }}>
        🔒 {t("w.social.privateResults")} {rel === "requested" ? t("w.social.followPending") : followsUser(rel) ? "" : t("w.social.followToSee")}
      </div>
    );
  }

  return (
    <>
      {stats && (
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {[
            { label: t("w.social.statVolume"), value: `${Math.round(stats.totalVolumeKg / 1000)}t` },
            { label: t("w.social.statStreak"), value: `${stats.currentStreak}d` },
            { label: t("w.social.statSessions"), value: stats.totalSessions.toLocaleString() },
          ].map((i) => (
            <div key={i.label} style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: C("ink2"), borderRadius: 14 }}>
              <div style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.subtitle, color: C("chalk") }}>{i.value}</div>
              <div style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C("ash"), marginTop: 2 }}>{i.label}</div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.topLifts.length > 0 && (
        <>
          <SectionHead title={t("w.social.topLifts")} />
          <div>
            {stats.topLifts.map((l) => (
              <div key={l.lift} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C("line")}` }}>
                <span style={{ color: C("chalk"), fontSize: fs.body }}>{l.lift}</span>
                <span style={{ fontFamily: mono, fontSize: fs.body, color: accentText("lime") }}>{l.topLoad} kg</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMPARE — an expander, at the foot of the figures it compares against.
          It doesn't leave, so it wears no arrow and no ring, and it is ash
          rather than the accent: the accent is the "go" colour, and an
          expander never goes anywhere. (CLAUDE.md, the exit grammar.) */}
      {canCompareWith(data) && !compare && (
        <button
          className="pressable"
          onClick={onCompare}
          disabled={busy}
          style={{ display: "block", marginTop: 16, background: "none", border: "none", padding: 0, cursor: "pointer", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption }}
        >
          {busy ? `${t("w.user.comparing")}` : `＋ ${t("w.user.compareWith")}`}
        </button>
      )}

      {compare && (
        <>
          <SectionHead title={`${t("w.social.you")} ${compare.score.a} — ${compare.score.b} ${name}`} />
          {[...compare.lines, ...compare.sharedLifts.map((s: SharedLift) => ({ ...s, label: s.lift, unit: "kg" }))].map((l, i: number) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>
              <span style={{ textAlign: "right", fontFamily: mono, color: l.leader === "a" ? C("lime") : C("chalk") }}>{l.a}{l.unit}</span>
              <span style={{ fontSize: fs.nano, color: C("ash"), textAlign: "center", whiteSpace: "nowrap" }}>{l.label}</span>
              <span style={{ fontFamily: mono, color: l.leader === "b" ? C("lime") : C("chalk") }}>{l.b}{l.unit}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ── COACHING ─────────────────────────────────────────────────────────────── */

function Coaching({
  data, handle, onReload, onOpenUser,
}: {
  data: UserPageResponse;
  handle: string;
  onReload: () => Promise<void>;
  onOpenUser?: (handle: string) => void;
}) {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const coach = data.coach!;
  const busy = useBusy();
  const [preview, setPreview] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  const enrol = (programId: string) => busy.run(programId, async () => {
    const r = await jsend<MutationResult>("/api/coaches/enroll", "POST", { programId });
    if (r.error) { alert(r.error); return; }
    await onReload();
  });
  const submitReview = () => busy.run("rev", async () => {
    const r = await jsend<MutationResult>(`/api/coaches/${encodeURIComponent(handle)}/reviews`, "POST", { rating, body });
    if (r.error) { alert(r.error); return; }
    setReviewOpen(false); setBody("");
    await onReload();
  });

  return (
    <>
      {/* The professional half: what they coach, for whom, at what price. */}
      <div style={{ marginTop: 16 }}>
        {coach.rating !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Stars rating={coach.rating} />
            <span style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash") }}>{coach.reviews.length} {t("w.coaches.reviews").toLowerCase()}</span>
          </div>
        )}
        {coach.bio && <p style={{ color: C("chalk"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, marginTop: 10 }}>{coach.bio}</p>}
        {(coach.specialties.length > 0 || coach.sports.length > 0) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {[...coach.specialties, ...coach.sports].map((s) => (
              <span key={s} style={{ fontSize: fs.caption, padding: "4px 10px", borderRadius: 999, background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}` }}>{s}</span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: fs.caption, color: C("ash") }}>
          {coach.priceNote && <span>{coach.priceNote}</span>}
          <span style={{ color: coach.acceptingClients ? accentText("lime") : C("ash") }}>
            {coach.acceptingClients ? t("w.user.takingClients") : t("w.user.notTakingClients")}
          </span>
        </div>
        {coach.isMyCoach && <div style={{ marginTop: 10, color: accentText("lime"), fontSize: fs.caption }}>✓ {t("w.coaches.isYourCoach")}</div>}
      </div>

      {/* Programs. */}
      <SectionHead title={t("w.coaches.onlinePrograms")} meta={coach.programs.length ? String(coach.programs.length) : undefined} />
      {coach.programs.length === 0 ? (
        <div style={{ color: C("ash"), fontSize: fs.caption }}>{t("w.coaches.noPublished")}</div>
      ) : coach.programs.map((p: StorefrontProgram) => (
        <div key={p.id} style={card(aurora, { marginBottom: 10, padding: 14 })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C("chalk"), fontFamily: heading, fontWeight: 700, fontSize: fs.body }}>{p.name}</div>
              <div style={{ color: C("ash"), fontSize: fs.caption }}>{[p.goal, p.level, p.weeks ? `${p.weeks} ${t("w.coaches.weeks")}` : null].filter(Boolean).join(" – ")}</div>
            </div>
            {p.enrollmentStatus ? (
              <span style={{ fontSize: fs.caption, color: p.enrollmentStatus === "active" ? C("lime") : C("ash"), fontFamily: mono, whiteSpace: "nowrap" }}>
                {p.enrollmentStatus === "active" ? `${t("w.coaches.enrolled")} ✓` : t("w.social.requested")}
              </span>
            ) : canEnrolProgram(data, p) ? (
              <Btn small onClick={() => enrol(p.id)} disabled={busy.is(p.id)}>{t("w.coaches.startProgram")}</Btn>
            ) : null}
          </div>
          {p.summary && <p style={{ color: C("chalk"), fontSize: fs.caption, marginTop: 8, lineHeight: `${leading(fs.caption)}px` }}>{p.summary}</p>}
          {Array.isArray(p.preview) && p.preview.length > 0 && (
            <>
              {/* An expander GROWS in place — bare +/−, never an arrow ring,
                  and never the accent: it goes nowhere. */}
              <button className="pressable" onClick={() => setPreview(preview === p.id ? null : p.id)}
                style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: fs.caption, fontFamily: "var(--font-display)", fontWeight: 700, padding: 0 }}>
                {preview === p.id ? `− ${t("w.coaches.hidePreview")}` : `＋ ${t("w.coaches.previewPlan")}`}
              </button>
              {preview === p.id && (
                <div style={{ marginTop: 8 }}>
                  {p.preview.map((w: ProgramPreviewWeek, wi: number) => (
                    <div key={wi} style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C("ash") }}>{t("w.coaches.week")} {wi + 1}</div>
                      {w.days.map((d: ProgramPreviewDay, di: number) => (
                        <div key={di} style={{ marginTop: 4 }}>
                          <div style={{ color: C("chalk"), fontSize: fs.caption, fontWeight: 600 }}>{d.day || `${t("w.coaches.day")} ${di + 1}`}</div>
                          <div style={{ color: C("ash"), fontSize: fs.caption }}>{d.items.map((it: ProgramPreviewItem) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" – ") || "—"}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Reviews — written only by people the coach actually coached. */}
      <SectionHead title={t("w.coaches.reviews")} meta={coach.reviews.length ? String(coach.reviews.length) : undefined} />
      {canReviewCoach(data) && (
        <div style={{ marginBottom: 12 }}>
          <Btn ghost small onClick={() => setReviewOpen((o) => !o)}>{reviewOpen ? t("common.cancel") : t("w.coaches.writeReview")}</Btn>
        </div>
      )}
      {reviewOpen && (
        <div style={card(aurora, { marginBottom: 12, padding: 14 })}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button className="pressable" key={n} onClick={() => setRating(n)} aria-label={`${n}`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: n <= rating ? C("gold") : C("line") }}>★</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("w.coaches.reviewPlaceholder")}
            style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 12, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: fs.caption }} />
          <div style={{ marginTop: 8 }}><Btn small onClick={submitReview} disabled={busy.is("rev")}>{t("w.coaches.submitReview")}</Btn></div>
        </div>
      )}
      {coach.reviews.length === 0 ? (
        <div style={{ color: C("ash"), fontSize: fs.caption }}>{t("w.social.noReviews")}</div>
      ) : coach.reviews.map((rv: StorefrontReview) => (
        <div key={rv.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="pressable" onClick={() => rv.author?.handle && onOpenUser?.(rv.author.handle)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: onOpenUser ? "pointer" : "default" }}>
              <Avatar url={rv.author?.avatarUrl} name={rv.author?.displayName} handle={rv.author?.handle} size={26} />
              <span style={{ color: C("chalk"), fontWeight: 600, fontSize: fs.caption }}>{rv.author?.displayName || `@${rv.author?.handle}`}</span>
            </button>
            <span style={{ color: C("gold"), fontSize: fs.caption }}>{"★".repeat(rv.rating)}</span>
          </div>
          {rv.body && <p style={{ color: C("ash"), fontSize: fs.caption, margin: "6px 0 0", lineHeight: `${leading(fs.caption)}px` }}>{rv.body}</p>}
        </div>
      ))}
    </>
  );
}
