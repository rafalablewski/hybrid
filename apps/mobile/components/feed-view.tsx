import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, TextInput, FlatList, RefreshControl, Animated } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Loading, F, fs, leading, serifIf, tracking, useScreenBottomPad, useHubDissolve, PressScale as Pressable } from "../lib/ui";
import { router } from "expo-router";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import type { FeedItemView, LiveAthlete, OwnProfile, Relation } from "@hybrid/core";
import { colors, feedPostPath, HUB_MASTHEAD, seedPerson, userPagePath } from "@hybrid/core";
import { getFeed, getMyProfile, toggleKudos, createPost, deletePost } from "../lib/social-api";
import { Avatar, Empty, SButton } from "./social-kit";
import { GUTTER, RADIUS } from "./aurora/kit";
import FeedCard from "./feed-card";
import { Comments } from "./feed-comments";
import FeedLiveStrip from "./feed-live-strip";
import { CosignInbox } from "./pr-attestation";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { syncSaved } from "../lib/feed-actions";
import { useNavScrollProps } from "../lib/nav-scroll";
import { AuroraScreen } from "./aurora/kit";
import type { HeroScrollProps } from "./aurora/hero";
import { useConfirm } from "./aurora/confirm";

/**
 * CONNECT — the feed (mobile). Twin of apps/web/components/social-feed.tsx.
 * Both screens render the shared card model from core (feed-card.ts), and the
 * order is the spec's (reference/feed-spec.html, D2): co-sign inbox → feed
 * tabs → the always-open composer → the stream → the caught-up marker, which
 * hands the athlete back to the bar rather than to more scrolling.
 */
type FeedTab = "forYou" | "following";

export default function FeedView({ top }: { top?: ReactNode }) {
  const { notify, confirm } = useConfirm();
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItemView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [live, setLive] = useState<LiveAthlete[]>([]);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);
  // My own face beside the composer — the one identity the feed response
  // doesn't carry, so the screen fetches it once itself.
  const [me, setMe] = useState<OwnProfile | null>(null);
  useEffect(() => { getMyProfile().then((r) => setMe(r.profile ?? null)).catch(() => {}); }, []);

  const load = useCallback(
    () =>
      getFeed().then((r) => {
        setFeed(r.feed ?? []);
        setLive(r.live ?? []);
      }),
    [],
  );
  useEffect(() => { load(); }, [load]);
  // Reconcile the shelf with the server on open, so the bookmarks in the rows
  // below are this ACCOUNT's, not just this device's. Quiet no-op until
  // SavedPost is migrated (lib/feed-actions.ts).
  useEffect(() => { void syncSaved(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cheer = async (item: FeedItemView) => {
    // Optimistic: a kudos must never wait on the network to look given.
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe } : x)) ?? f);
    const r = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x)) ?? f);
  };
  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r = await createPost({ text, attachPr });
    setPosting(false);
    if (r.error) { notify(t("common.error"), r.error); return; }
    setText(""); setAttachPr(false); load();
  };

  // "Following" is the honest exit from the ranked feed: other people, newest
  // first, nothing ranked or interleaved.
  const items = useMemo(() => {
    if (!feed) return [];
    return tab === "following" ? feed.filter((i) => !i.mine).slice().sort((a, b) => b.at - a.at) : feed;
  }, [feed, tab]);
  // What the ⋯ menu changed about an AUTHOR. A follow re-labels every card by
  // that person; a block takes them out of the stream entirely — the server
  // already made them invisible, so leaving their rows on screen until the next
  // load would be the one place the app disagreed with itself.
  const authorChanged = ({ authorId, relation, blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) =>
    setFeed((f) => (blocked
      ? f?.filter((x) => x.author.id !== authorId) ?? f
      : f?.map((x) => (x.author.id === authorId ? { ...x, relation } : x)) ?? f));

  // Delete ASKS FIRST. It used to be a bare × in the row's corner and it
  // deleted on the first press with nothing in between; web has always put a
  // confirm in front of it, and moving delete into a small anchored menu makes
  // a mishit easier, not harder. Same string both clients read.
  const del = async (item: FeedItemView) => {
    const ok = await confirm({ title: t("w.social.deletePostConfirm"), confirmLabel: t("common.delete"), destructive: true });
    if (!ok) return;
    await deletePost(item.subjectId);
    load();
  };
  const padBottom = useScreenBottomPad();
  const navScroll = useNavScrollProps();

  // AS A HUB TAB (`top` provided — Today handing over its header + pills): the
  // chrome renders plainly so it holds still across the switch, and the feed's
  // own content dissolves in beneath it (lib/ui useHubDissolve — the pills'
  // flying lens owns the motion). The list is virtualized, so the fade rides
  // on the header block and on each card rather than one wrapper; the header's
  // onLayout starts the native-driver fade for all of them (same commit).
  const hub = top != null;
  const { style: hubFade, start: startHubFade } = useHubDissolve(hub);
  const fade = hub ? hubFade : undefined;

  const header = (
    <>
      {top}
      {/* AS A HUB TAB THERE IS NO HEAD AT ALL, and that is the point.
          The feed used to draw the SHARED hub masthead here — "Feed", in the
          display face, directly under a segmented control whose Feed pill was
          already lit. A screen may name itself once, and the control that
          selected it counts as the naming; saying it twice cost ~70dp of a
          852dp screen and pushed the first post past the 40% mark.

          It took the empty meta row with it. That row existed only to reserve
          height so the title's y matched Dashboard's and Performance's — a
          baseline for a title that no longer exists. `hub-feed-meta` is
          therefore closed by DELETION rather than by inventing a figure to fill
          it (capabilities.ts).

          What remains is the gap the masthead used to emit above itself
          (HUB_MASTHEAD.gap.control) — the pills-to-content distance, which is
          the feed's to keep now that nothing sits between them. Standing alone
          (a pushed screen, `top` absent) the hero still titles the screen:
          there is no control up there to do it instead. */}
      <Animated.View style={[fade, top ? { marginTop: HUB_MASTHEAD.gap.control } : null]} onLayout={startHubFade}>
      {/* Verified-record witness requests addressed to ME — a person is waiting
          on this answer, so it outranks every piece of content below it, and
          every request is also an invite. See core/attestation.ts. */}
      <CosignInbox units={units} />

      {/* FEED TABS — the ranked feed only earns trust while an unranked exit
          exists beside it. People-search rides the row's right side as a bare
          icon (the SectionHead idiom) — a full search bar would spend a row of
          the stream on a rare action. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {(["forYou", "following"] as FeedTab[]).map((id) => (
          <Pressable key={id} onPress={() => setTab(id)}>
            <View style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: tab === id ? C.ash : C.line, backgroundColor: tab === id ? C.ink2 : "transparent" }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.micro, color: tab === id ? C.chalk : C.ash }}>{t(`feed.tab.${id}`)}</Text>
            </View>
          </Pressable>
        ))}
        {/* Saved sits FIRST on the right because it is where the bookmark in
            every row below leads: the glyph that fills on a post is the same
            glyph that opens the shelf. */}
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.push("/saved")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("w.social.savedTitle")}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Path d="M4.5 2.8h9v12.4l-4.5-3.4-4.5 3.4Z" stroke={C.ash} strokeWidth={1.6} strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Pressable onPress={() => router.push("/discover")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("w.social.searchPeople")}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Circle cx={8} cy={8} r={5.5} stroke={C.ash} strokeWidth={1.6} />
              <Path d="m12.4 12.4 3.4 3.4" stroke={C.ash} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* NOW TRAINING — presence, not authored ephemera. Hides when empty. */}
      <FeedLiveStrip live={live} onOpen={(h) => { if (h) router.push(userPagePath(h)); }} />

      {/* COMPOSER — the X compose box's grammar, not a card: my avatar beside
          a bare auto-growing field, then one accent glyph row with the Share
          pill on its right, the whole block running edge to edge between two
          hairlines. No fill, no border, no radius, no open/close state — the
          box is always one tap from typing, and the pill sits dimmed until
          there is something to post. It bleeds under the screen gutter exactly
          like the timeline rows below it, so its hairline and the stream's run
          the same edge-to-edge width. Twin of web's Composer
          (apps/web/components/social-feed.tsx). */}
      <View style={{ marginHorizontal: -GUTTER, paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Avatar url={me?.avatarUrl} name={me?.displayName} handle={me?.handle} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Bare and one line tall until the text needs more — the X idiom:
                the placeholder IS the invitation, at heading size. */}
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              placeholder={t("w.social.sharePlaceholder")}
              placeholderTextColor={C.ash}
              style={{ color: C.chalk, fontSize: fs.heading, lineHeight: leading(fs.heading), fontFamily: F.reg, paddingTop: 7, paddingBottom: 2, paddingHorizontal: 0, textAlignVertical: "top" }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
              {/* The one attachment this product has — the latest PR — as an
                  accent glyph in X's toolbar position. It fills when attached. */}
              <Pressable
                onPress={() => setAttachPr((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: attachPr }}
                accessibilityLabel={t("w.social.attachPr")}
              >
                <Svg width={19} height={19} viewBox="0 0 18 18" fill={attachPr ? txt(C, colors.lime) : "none"}>
                  <Circle cx={9} cy={6.8} r={4.1} stroke={txt(C, colors.lime)} strokeWidth={1.5} />
                  <Path d="M6.6 10.3 5.2 15.2l3.8-1.9 3.8 1.9-1.4-4.9" fill="none" stroke={txt(C, colors.lime)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
              <SButton label={posting ? t("w.social.sharing") : t("w.social.share")} small onPress={share} disabled={posting || (!text.trim() && !attachPr)} />
            </View>
          </View>
        </View>
      </View>

      {/* The stream boundary. The rows below are full-bleed timeline rows
          (feed-card.tsx), each closed by an edge-to-edge hairline — the header
          hands over with the same line so the first post is bounded top. */}
      <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: -GUTTER }} />
      </Animated.View>
    </>
  );

  const renderItem = ({ item }: { item: FeedItemView }) => (
    <Animated.View style={fade}>
      <FeedCard
        item={item}
        units={units}
        onOpenProfile={(h) => { if (h) { seedPerson(item.author); router.push(userPagePath(h)); } }}
        onKudos={() => cheer(item)}
        onComments={() => setOpen(open === item.id ? null : item.id)}
        // EVERY post opens its own screen — a workout, a record, a status
        // update alike. Opening COLLAPSES the row's inline thread: the post
        // carries the same thread, and two mounted copies would fetch the same
        // comments twice and then disagree the moment one of them posted.
        onOpen={() => { setOpen(null); router.push(feedPostPath(item)); }}
        onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
        onAuthorChanged={authorChanged}
      >
        {open === item.id ? <Comments item={item} /> : null}
      </FeedCard>
    </Animated.View>
  );

  // The exit. The feed's job is to make you train, not to make you scroll — so
  // the end of the stream is a door back to the bar, not more content.
  const footer =
    items.length === 0 ? null : (
      <Animated.View style={[fade, { alignItems: "center", paddingTop: 14, paddingBottom: 8 }]}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>{t("feed.caughtUp").toUpperCase()}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 6, marginBottom: 10, textAlign: "center" }}>{t("feed.caughtUpSub")}</Text>
        <SButton label={t("feed.goTrain")} onPress={() => router.push("/log")} />
      </Animated.View>
    );

  // The FlatList stays the sole scroller in BOTH shapes — a screen never trades
  // virtualization for a hero.
  const list = (extra: Record<string, unknown>) => (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={
        <Animated.View style={fade}>
          {feed === null ? (
            <Loading />
          ) : (
            <Empty
              title={tab === "following" ? t("feed.followingEmpty") : t("w.social.feedQuietTitle")}
              sub={tab === "following" ? t("feed.followingEmptySub") : t("w.social.feedQuietSub")}
            />
          )}
        </Animated.View>
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      initialNumToRender={6}
      windowSize={11}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.lime} colors={[C.lime]} />}
      {...extra}
    />
  );

  // AS A HUB TAB Today owns the head, so the plain shell is still right:
  // hubTab → inset padding instead of a fresh SafeAreaView, so the chrome
  // doesn't jump under the status bar for the remount's first frame.
  if (hub || top) {
    return (
      // padding={0}: the FlatList's contentContainer owns ALL the screen
      // padding — the shell must not pad on top of it, or the feed sits
      // double-inset (16+16, the old bug) and the rows' full-bleed margins
      // can't reach the physical edge.
      <AuroraScreen scroll={false} hubTab={hub} padding={0}>
        {list({ ...navScroll, contentContainerStyle: { paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: padBottom } })}
      </AuroraScreen>
    );
  }
  return (
    <AuroraScreen
      hero={{ rank: "title", title: t("w.social.feedTitle") }}
      // GUTTER — the app's screen gutter the rows' full-bleed margins assume;
      // the hub shape above uses the same value.
      scroller={(scrollProps: HeroScrollProps) => list({ ...scrollProps, contentContainerStyle: [scrollProps.contentContainerStyle, { paddingHorizontal: GUTTER }] })}
    />
  );
}
