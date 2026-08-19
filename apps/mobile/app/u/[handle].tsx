import { useEffect, useState } from "react";
import { View, Text, TextInput, Share } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  canEnrolProgram,
  canReviewCoach,
  feedPostPath,
  followsUser,
  userPagePath,
  fs,
  leading,
  tracking,
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
  CompareResult,
  FeedItemView,
  PeopleTab,
  PersonCard,
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
import { F, Loading, LoadSwap, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, ASection, ASegment, cardStack, RADIUS, Avatar, Empty, Stars, levelInk, APill } from "../../components/aurora/kit";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useConfirm } from "../../components/aurora/confirm";
import { HeroAccessory } from "../../components/aurora/hero";
import {
  blockUser, enrollProgram, follow, getCompare, getUserActivity, getUserPage, getUserPeople, postReview, reportTarget, toggleKudos, unfollow,
} from "../../lib/social-api";
import FeedCard from "../../components/feed-card";
import { Comments } from "../../components/feed-comments";
import { usePersonSource } from "../../lib/shared-element";
import { Glyph } from "../../components/aurora/icons";

/**
 * THE INDIVIDUAL USER PAGE (mobile).
 *
 * One page per person, at `/u/<handle>` (core `userPagePath`). It replaced two
 * sheets that disagreed about the same human — the profile modal (who they are)
 * and the coach modal (what they sell) — for the same reasons the post screen
 * replaced its sheet: a sheet has no address, and it could only ever open a
 * handle the screen underneath had already loaded.
 *
 * A COACH'S PAGE IS AN ATHLETE'S PAGE, plus a coaching tab. Which tabs exist,
 * which verbs the viewer gets, and who may review or enrol are decided in core
 * (user-page.ts), so this screen and the web page cannot drift.
 */

export default function UserScreen() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { confirm, notify } = useConfirm();
  const units = useLoggerPrefs().units;
  const params = useLocalSearchParams<{ handle?: string }>();
  const handle = (typeof params.handle === "string" ? params.handle : "").toLowerCase();

  const [data, setData] = useState<UserPageResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<UserPageTabId>("overview");
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [peopleTab, setPeopleTab] = useState<PeopleTab>("followers");
  // The timeline pages independently of the rest of the payload: page 1 arrives
  // with the person, older pages one door-press at a time.
  const [older, setOlder] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // What the row that opened us already knew (core/person-seed.ts) — the first
  // frame paints the person, not a spinner where the person will be.
  const seed = peekPerson(handle);

  const load = async () => {
    const d = await getUserPage(handle);
    if (!d?.profile) { setFailed(true); return; }
    setFailed(false);
    setData(d);
  };
  useEffect(() => { setData(null); setCmp(null); load(); /* eslint-disable-next-line */ }, [handle]);

  const p = data?.profile;
  const rel = data ? userPageRelation(data) : "none";
  const tabs = data ? userPageTabs(data) : [];
  const shown = resolveUserPageTab(tabs, tab);
  const name = p?.displayName || seed?.displayName || `@${p?.handle ?? handle}`;
  const hero = { rank: "title" as const, title: name, eyebrow: `@${p?.handle ?? handle}` };

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const doShare = () => { if (p) void Share.share({ message: `${userShare(p).text}\n${userShare(p).url}` }); };
  const doBlock = async () => {
    const ok = await confirm({ title: t("w.social.block"), message: t("w.social.blockConfirm").replace("{h}", handle), confirmLabel: t("w.social.block"), destructive: true });
    if (!ok) return;
    await blockUser({ handle });
    router.back();
  };
  const doReport = async () => {
    if (!p?.userId) return;
    const ok = await confirm({ title: t("w.social.report"), message: t("w.social.reportConfirm").replace("{h}", handle), confirmLabel: t("w.social.report"), destructive: true });
    if (!ok) return;
    await reportTarget({ targetType: "socialProfile", targetId: p.userId, reason: "inappropriate" });
    void notify(t("w.social.reportThanks"));
  };
  /** APPEND the next page of their timeline. The cursor is the server's, so the
   *  page continues exactly where the last one stopped even if they have
   *  trained since. */
  const loadOlder = async () => {
    if (!data?.activityCursor || older) return;
    setOlder(true);
    try {
      const d = await getUserActivity(handle, data.activityCursor);
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

  /** A kudos must never wait on the network to look given. */
  const cheer = async (item: FeedItemView) => {
    const patch = (fn: (x: FeedItemView) => FeedItemView) =>
      setData((d) => (d ? { ...d, activity: d.activity.map((x) => (x.id === item.id ? fn(x) : x)) } : d));
    patch((x) => ({ ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe }));
    const r = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    patch((x) => ({ ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe }));
  };

  if (failed) {
    return (
      <AuroraScreen hero={{ rank: "title", title: `@${handle}` }}>
        <Empty title={t("w.user.missing")} sub={t("w.user.missingSub")} />
      </AuroraScreen>
    );
  }
  if (!data || !p) {
    return (
      <AuroraScreen hero={hero}>
        {seed ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Avatar url={seed.avatarUrl} name={seed.displayName} handle={seed.handle} size={84} shared />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.title }}>{name}</Text>
              <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: fs.caption }}>@{seed.handle}</Text>
            </View>
          </View>
        ) : (
          <Loading />
        )}
      </AuroraScreen>
    );
  }

  const action = userPageAction(data);
  const coach = data.coach;
  const label = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase" as const, color: C.ash };

  return (
    <AuroraScreen
      hero={hero}
      /* SHARE lives in the rail's trailing slot — the app's own home for a
         screen-level utility, and where iOS puts it. It used to be a fourth
         button in a row of four, which is how a page ends up with no centre. */
      accessory={<HeroAccessory label={t("w.user.share")} onPress={doShare} onDark={false} />}
    >
      {/* ── WHO ── the person, at the size a page allows. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={84} shared />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.title }}>
            {name}{p.coachVerified ? <Text style={{ color: txt(C, C.lime) }}> ✓</Text> : null}
          </Text>
          <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: fs.caption }}>@{p.handle}</Text>
          {/* The earned level, as one word — gated server-side by the same
              privacy rule as the stats, and never carrying the ratio behind it. */}
          {data.fitnessLevel ? (
            <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: levelInk(C, data.fitnessLevel.accent), borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 }}>
              <Text style={{ ...label, fontFamily: F.monoBold, color: levelInk(C, data.fitnessLevel.accent) }}>{t(LEVEL_KEY[data.fitnessLevel.level])}</Text>
            </View>
          ) : null}
          {coach?.headline ? (
            <Text style={{ color: txt(C, C.lime), fontFamily: F.bold, fontSize: fs.body, marginTop: 6 }}>{coach.headline}</Text>
          ) : null}
        </View>
      </View>

      {p.bio ? <Text style={{ color: C.chalk, fontSize: fs.body, lineHeight: leading(fs.body), marginTop: 14 }}>{p.bio}</Text> : null}

      {/* ── THE COUNTS ── who they reach, and how much they train. */}
      <View style={{ flexDirection: "row", marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 10 }}>
        {[
          /* The two follow counts OPEN the list they count — the gesture every
             social product has taught. They select the People tab rather than
             pushing a screen, so a person still has exactly one address. */
          { v: data.counts.followers.toLocaleString(), l: t("w.user.followers"), go: data.canViewResults ? () => { setPeopleTab("followers"); setTab("people"); } : undefined },
          { v: data.counts.following.toLocaleString(), l: t("w.user.following"), go: data.canViewResults ? () => { setPeopleTab("following"); setTab("people"); } : undefined },
          ...(data.stats ? [{ v: data.stats.totalSessions.toLocaleString(), l: t("w.social.statSessions"), go: undefined }] : []),
        ].map((f) => (
          <Pressable
            key={f.l}
            disabled={!f.go}
            onPress={f.go}
            style={{ flex: 1, alignItems: "center" }}
          >
            <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.subtitle }}>{f.v}</Text>
            <Text style={{ ...label, marginTop: 2 }}>{f.l}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── THE ONE BUTTON ── full width, because a page with one action
          should not make you look for it. Core decides which verb it is. */}
      {action ? (
        <View style={{ marginTop: 14 }}>
          <APill
            label={action.id === "unfollow" ? `${t(action.labelKey)} ✓` : t(action.labelKey)}
            variant={!action.primary ? "outline" : "primary"}
            disabled={busy === "f" || action.id === "requested"}
            onPress={action.id === "follow"
              ? () => run("f", async () => { await follow({ handle }); await load(); })
              : action.id === "unfollow"
                ? () => run("f", async () => { await unfollow({ handle }); await load(); })
                // "Requested" is a state, not an action; it renders disabled.
                : () => {}}
          />
        </View>
      ) : null}

      {/* ── THE TABS ── navigation, and therefore NOT buttons. They used to be
          chips under a row of pills, which made a field of seven equal-looking
          controls out of two different kinds of thing; that fix left them as
          text on a rule, with the accent UNDER the one you're on — and the
          accent was the part that did not survive the second look. Chartreuse
          is the app's one "go" colour and a tab goes nowhere it isn't already,
          so this is `ASegment` now, like every other switch in the app: a
          neutral lens that travels on springs.lens, with a haptic at the
          commit. The row's hairline went with the rule — a track is an object,
          not a rule, and each tab's content already sets its own top step.

          VALUE IS `shown`, NOT `tab`. The two differ: a tab that no longer
          exists (a coach who stopped coaching, a page that turned private)
          falls back to Overview through resolveUserPageTab, and feeding the
          raw want to a control that finds its index by identity would park the
          lens on segment 0 while the page rendered something else. */}
      {tabs.length > 1 ? (
        <View style={{ marginTop: 20 }}>
          <ASegment
            options={tabs.map((x) => ({ id: x.id, label: t(x.labelKey) }))}
            value={shown}
            onPick={setTab}
          />
        </View>
      ) : null}

      {shown === "overview" ? (
        <Overview
          data={data}
          cmp={cmp}
          name={name}
          busy={busy === "c"}
          onCompare={() => run("c", async () => { const r = await getCompare(handle); setCmp(r.compare ?? null); })}
        />
      ) : null}
      {shown === "coaching" && coach ? <Coaching data={data} handle={handle} onReload={load} /> : null}
      {shown === "activity" ? (
        data.activity.length === 0 ? (
          <Empty title={t("w.user.noActivity")} sub={t("w.user.noActivitySub").replace("{n}", name)} />
        ) : (
          <View style={{ marginTop: 12 }}>
            {data.activity.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                units={units}
                onOpenProfile={(h: string) => { if (h && h !== p.handle) router.push(`/u/${h}`); }}
                onKudos={() => cheer(item)}
                onComments={() => setThread(thread === item.id ? null : item.id)}
                onOpen={() => { setThread(null); router.push(feedPostPath(item)); }}
                onAuthorChanged={({ blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) => { if (blocked) router.back(); }}
              >
                {thread === item.id ? <Comments item={item} /> : null}
              </FeedCard>
            ))}
            {/* More to read → the door. Nothing more → say WHY it stopped, but
                only when the stop is ours: a timeline that simply ran out of
                workouts is allowed to just end. */}
            {data.activityCursor ? (
              <LoadMore label={t("w.user.loadOlder")} busy={older} busyLabel={t("w.user.loading")} onLoad={loadOlder} />
            ) : data.activityCapped ? (
              <ListEnd text={t("w.user.activityCapped").replace("{n}", String(data.activity.length))} />
            ) : null}
          </View>
        )
      ) : null}

      {shown === "people" ? <People handle={handle} tab={peopleTab} onTab={setPeopleTab} /> : null}

      {/* ── THE QUIET VERBS ── never beside the ones you're meant to use. */}
      {rel !== "self" ? (
        <View style={{ flexDirection: "row", gap: 16, marginTop: 24, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
          <Pressable onPress={doReport} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Glyph name="flag" size={fs.caption} color={C.ash} /><Text style={{ color: C.ash, fontSize: fs.caption, fontFamily: F.bold }}>{t("w.social.report")}</Text></Pressable>
          <Pressable onPress={doBlock}><Text style={{ color: txt(C, C.red), fontSize: fs.caption, fontFamily: F.bold }}>⊘ {t("w.social.block")}</Text></Pressable>
        </View>
      ) : null}
    </AuroraScreen>
  );
}

/* ── OVERVIEW ─────────────────────────────────────────────────────────────── */

function Overview({ data, cmp, name, onCompare, busy }: {
  data: UserPageResponse;
  cmp: CompareResult | null;
  name: string;
  onCompare: () => void;
  busy: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const stats = data.stats;
  const label = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase" as const, color: C.ash };

  if (!data.canViewResults) {
    const rel = userPageRelation(data);
    return (
      <View style={{ marginTop: 16, backgroundColor: C.ink2, borderRadius: RADIUS.field, padding: 16 }}>
        <Text style={{ color: C.ash, fontSize: fs.body, lineHeight: leading(fs.body) }}>
          {t("w.social.privateResults")} {rel === "requested" ? t("w.social.followPending") : followsUser(rel) ? "" : t("w.social.followToSee")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {stats ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {[
            // Core figure-order.ts — tonnage, the session count, then the
            // streak, which is a fact ABOUT that count and follows it.
            { l: t("w.social.statVolume"), v: `${Math.round(stats.totalVolumeKg / 1000)}t` },
            { l: t("w.social.statSessions"), v: stats.totalSessions.toLocaleString() },
            { l: t("w.social.statStreak"), v: `${stats.currentStreak}d` },
          ].map((s) => (
            <View key={s.l} style={{ flex: 1, backgroundColor: C.ink2, borderRadius: RADIUS.field, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: C.chalk, fontFamily: F.black, fontSize: fs.subtitle }}>{s.v}</Text>
              <Text style={{ ...label, marginTop: 2 }}>{s.l}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {stats && stats.topLifts.length > 0 ? (
        <>
          <ASection title={t("w.social.topLifts")} />
          {stats.topLifts.map((l) => (
            <View key={l.lift} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text style={{ color: C.chalk, fontSize: fs.body }}>{l.lift}</Text>
              <Text style={{ color: txt(C, C.lime), fontFamily: F.mono, fontSize: fs.body }}>{l.topLoad} kg</Text>
            </View>
          ))}
        </>
      ) : null}

      {/* COMPARE — an expander, at the foot of the figures it compares against.
          It doesn't leave, so it wears no arrow and no ring, and it is ash
          rather than the accent: the accent is the "go" colour, and an expander
          never goes anywhere. (CLAUDE.md, the exit grammar.) */}
      {canCompareWith(data) && !cmp ? (
        <Pressable onPress={onCompare} disabled={busy} style={{ alignSelf: "flex-start", marginTop: 16 }}>
          <Text style={{ color: C.ash, fontFamily: F.bold, fontSize: fs.caption }}>
            {busy ? t("w.user.comparing") : `＋ ${t("w.user.compareWith")}`}
          </Text>
        </Pressable>
      ) : null}

      {cmp ? (
        <>
          <ASection title={`${t("w.social.you")} ${cmp.score.a} — ${cmp.score.b} ${name}`} />
          {[...cmp.lines, ...cmp.sharedLifts.map((s: SharedLift) => ({ ...s, label: s.lift, unit: "kg" }))].map((l, i: number) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text style={{ flex: 1, textAlign: "right", fontFamily: F.mono, color: l.leader === "a" ? C.lime : C.chalk }}>{l.a}{l.unit}</Text>
              <Text style={{ width: 120, textAlign: "center", color: C.ash, fontSize: fs.nano }}>{l.label}</Text>
              <Text style={{ flex: 1, fontFamily: F.mono, color: l.leader === "b" ? C.lime : C.chalk }}>{l.b}{l.unit}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

/** THE DOOR AT THE END OF A LIST — it GROWS the list in place, so it takes the
 *  app's expander grammar: a bare ＋, in ash, no ring and no arrow. An arrow
 *  would promise a destination; there isn't one, there is just more of what you
 *  are already reading. Web twin: LoadMore in components/user-page.tsx. */
function LoadMore({ label, busy, busyLabel, onLoad }: { label: string; busy: boolean; busyLabel: string; onLoad: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable onPress={onLoad} disabled={busy} style={{ paddingVertical: 12 }}>
      <Text style={{ color: C.ash, fontFamily: F.bold, fontSize: fs.caption, textAlign: "center" }}>
        {busy ? busyLabel : `＋ ${label}`}
      </Text>
    </Pressable>
  );
}

/** The quiet line at the true end of a list — shown only when the end is OURS
 *  rather than theirs. */
function ListEnd({ text }: { text: string }) {
  const { palette: C } = useTheme();
  return (
    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, textAlign: "center", paddingVertical: 14 }}>
      {text}
    </Text>
  );
}

/* ── PEOPLE ───────────────────────────────────────────────────────────────── */

/** Who follows them, and who they follow. Rows carry no follow button of their
 *  own: a row opens the person, and acting on a person happens on their page,
 *  where the one button lives. */
function People({ handle, tab, onTab }: { handle: string; tab: PeopleTab; onTab: (t: PeopleTab) => void }) {
  // The face travels into the page this opens — see lib/shared-element.
  const armPerson = usePersonSource();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setPeople(null); setCursor(null);
    getUserPeople(handle, tab).then((d) => {
      if (!alive) return;
      setPeople(d.people ?? []);
      setCursor(d.nextCursor ?? null);
    });
    return () => { alive = false; };
  }, [handle, tab]);

  // APPEND, never replace: the rows already read stay put, and the cursor
  // guarantees the next page starts exactly where this one stopped.
  const loadMore = async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const d = await getUserPeople(handle, tab, cursor);
      setPeople((prev) => [...(prev ?? []), ...(d.people ?? [])]);
      setCursor(d.nextCursor ?? null);
    } finally {
      setMore(false);
    }
  };

  const side = (id: PeopleTab, l: string) => (
    <Pressable onPress={() => onTab(id)} accessibilityState={{ selected: tab === id }} style={{ paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: tab === id ? C.chalk : "transparent" }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: tab === id ? C.chalk : C.ash }}>{l}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", gap: 18, marginBottom: 6 }}>
        {side("followers", t("w.user.followers"))}
        {side("following", t("w.user.following"))}
      </View>
      <LoadSwap loading={!people}>
        {() => !people ? null : people.length === 0 ? (
        <Empty title={t(tab === "followers" ? "w.user.noFollowers" : "w.user.noFollowing")} />
      ) : (
        <>
          {people.map((c: PersonCard) => (
            <Pressable
              key={c.userId}
              onPress={() => { armPerson(c.handle); router.push(userPagePath(c.handle)); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}
            >
              <Avatar url={c.avatarUrl} name={c.displayName} handle={c.handle} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: fs.body }}>{c.displayName || `@${c.handle}`}</Text>
                <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: fs.nano }}>@{c.handle}</Text>
              </View>
            </Pressable>
          ))}
          {cursor ? <LoadMore label={t("w.user.loadMorePeople")} busy={more} busyLabel={t("w.user.loading")} onLoad={loadMore} /> : null}
        </>
      )}
      </LoadSwap>
    </View>
  );
}

/* ── COACHING ─────────────────────────────────────────────────────────────── */

function Coaching({ data, handle, onReload }: { data: UserPageResponse; handle: string; onReload: () => Promise<void> }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { notify } = useConfirm();
  const coach = data.coach!;
  const [preview, setPreview] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [enrolling, setEnrolling] = useState<string | null>(null);

  return (
    <>
      <View style={{ marginTop: 16 }}>
        {coach.rating !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Stars rating={coach.rating} />
            <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: fs.nano }}>{coach.reviews.length} {t("w.coaches.reviews").toLowerCase()}</Text>
          </View>
        ) : null}
        {coach.bio ? <Text style={{ color: C.chalk, fontSize: fs.body, lineHeight: leading(fs.body), marginTop: 10 }}>{coach.bio}</Text> : null}
        {coach.specialties.length > 0 || coach.sports.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {[...coach.specialties, ...coach.sports].map((s) => (
              <View key={s} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.pill, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.chalk, fontSize: fs.caption }}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          {coach.priceNote ? <Text style={{ color: C.ash, fontSize: fs.caption }}>{coach.priceNote}</Text> : null}
          <Text style={{ color: coach.acceptingClients ? txt(C, C.lime) : C.ash, fontSize: fs.caption }}>
            {coach.acceptingClients ? t("w.user.takingClients") : t("w.user.notTakingClients")}
          </Text>
        </View>
        {coach.isMyCoach ? <Text style={{ color: txt(C, C.lime), fontSize: fs.caption, marginTop: 10 }}>✓ {t("w.coaches.isYourCoach")}</Text> : null}
      </View>

      <ASection title={t("w.coaches.onlinePrograms")} meta={coach.programs.length ? String(coach.programs.length) : undefined} />
      {coach.programs.length === 0 ? (
        <Text style={{ color: C.ash, fontSize: fs.caption }}>{t("w.coaches.noPublished")}</Text>
      ) : coach.programs.map((p: StorefrontProgram) => (
        <ACard key={p.id} style={cardStack}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: fs.body }}>{p.name}</Text>
              <Text style={{ color: C.ash, fontSize: fs.caption }}>{[p.goal, p.level, p.weeks ? `${p.weeks} ${t("w.coaches.weeks")}` : null].filter(Boolean).join(" – ")}</Text>
            </View>
            {p.enrollmentStatus ? (
              <Text style={{ color: p.enrollmentStatus === "active" ? C.lime : C.amber, fontFamily: F.mono, fontSize: fs.caption }}>
                {p.enrollmentStatus === "active" ? `${t("w.coaches.enrolled")} ✓` : t("w.social.requested")}
              </Text>
            ) : canEnrolProgram(data, p) ? (
              <APill
                // The idle word holds the width and the in-flight one overlays
                // it (APill's commit state) — swapping the LABEL made "Start"
                // become "Starting…" and the button grow under the finger.
                label={t("w.coaches.start")}
                state={enrolling === p.id ? "saving" : "idle"} savingLabel={t("w.coaches.starting")}
                size="compact"
                disabled={!!enrolling}
                onPress={async () => {
                  if (enrolling) return;
                  setEnrolling(p.id);
                  const r = await enrollProgram(p.id);
                  setEnrolling(null);
                  if (r.error) { void notify(t("common.error"), r.error); return; }
                  await onReload();
                }}
              />
            ) : null}
          </View>
          {p.summary ? <Text style={{ color: C.chalk, fontSize: fs.caption, marginTop: 8, lineHeight: leading(fs.caption) }}>{p.summary}</Text> : null}
          {Array.isArray(p.preview) && p.preview.length > 0 ? (
            <>
              {/* An expander GROWS in place — bare +/−, never an arrow, and
                  never the accent: it goes nowhere. */}
              <Pressable onPress={() => setPreview(preview === p.id ? null : p.id)}>
                <Text style={{ color: C.ash, fontSize: fs.caption, fontFamily: F.bold, marginTop: 8 }}>
                  {preview === p.id ? `− ${t("w.coaches.hidePreview")}` : `＋ ${t("w.coaches.previewPlan")}`}
                </Text>
              </Pressable>
              {preview === p.id ? (
                <View style={{ marginTop: 8 }}>
                  {p.preview.map((w: ProgramPreviewWeek, wi: number) => (
                    <View key={wi} style={{ marginBottom: 8 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.coaches.week")} {wi + 1}</Text>
                      {w.days.map((d: ProgramPreviewDay, di: number) => (
                        <View key={di} style={{ marginTop: 4 }}>
                          <Text style={{ color: C.chalk, fontSize: fs.caption, fontFamily: F.bold }}>{d.day || `${t("w.coaches.day")} ${di + 1}`}</Text>
                          <Text style={{ color: C.ash, fontSize: fs.caption }}>{d.items.map((it: ProgramPreviewItem) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" – ") || "—"}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </ACard>
      ))}

      <ASection title={t("w.coaches.reviews")} meta={coach.reviews.length ? String(coach.reviews.length) : undefined} />
      {canReviewCoach(data) ? (
        <View style={{ alignSelf: "flex-start", marginBottom: 12 }}>
          <APill label={reviewOpen ? t("common.cancel") : t("w.coaches.writeReview")} variant="outline" size="compact" onPress={() => setReviewOpen((o) => !o)} />
        </View>
      ) : null}
      {reviewOpen ? (
        <ACard style={cardStack}>
          <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={String(n)}>
                <Text style={{ fontSize: fs.display, color: n <= rating ? C.amber : C.line }}>★</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder={t("w.coaches.reviewPlaceholder")}
            placeholderTextColor={C.ash}
            style={{ minHeight: 56, padding: 10, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, color: C.chalk, fontSize: fs.caption }}
          />
          <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
            <APill label={t("w.coaches.submitReview")} size="compact" onPress={async () => {
              const r = await postReview(handle, { rating, body });
              if (r.error) { void notify(t("common.error"), r.error); return; }
              setReviewOpen(false); setBody("");
              await onReload();
            }} />
          </View>
        </ACard>
      ) : null}
      {coach.reviews.length === 0 ? (
        <Text style={{ color: C.ash, fontSize: fs.caption }}>{t("w.social.noReviews")}</Text>
      ) : coach.reviews.map((rv: StorefrontReview) => (
        <View key={rv.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Pressable onPress={() => rv.author?.handle && router.push(`/u/${rv.author.handle}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Avatar url={rv.author?.avatarUrl} name={rv.author?.displayName} handle={rv.author?.handle} size={26} />
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: fs.caption }}>{rv.author?.displayName || `@${rv.author?.handle}`}</Text>
              <Text style={{ color: C.amber, fontSize: fs.caption }}>{"★".repeat(rv.rating)}</Text>
            </View>
          </Pressable>
          {rv.body ? <Text style={{ color: C.ash, fontSize: fs.caption, marginTop: 6, lineHeight: leading(fs.caption) }}>{rv.body}</Text> : null}
        </View>
      ))}
    </>
  );
}
