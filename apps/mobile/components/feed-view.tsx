import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, TextInput, FlatList, RefreshControl, Animated } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Loading, F, fs, leading, serifIf, tracking, useScreenBottomPad, useHubDissolve, PressScale as Pressable } from "../lib/ui";
import { router } from "expo-router";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import type { FeedItemView, CommentView, LiveAthlete } from "@hybrid/core";
import { colors } from "@hybrid/core";
import { getFeed, toggleKudos, getComments, postComment, createPost, deletePost } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SButton } from "./social-kit";
import { ACard, cardStack, GUTTER, RADIUS } from "./aurora/kit";
import { HubMasthead } from "./aurora/hub-masthead";
import FeedCard from "./feed-card";
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
 * tabs → the quiet composer → the stream → the caught-up marker, which hands
 * the athlete back to the bar rather than to more scrolling.
 */
type FeedTab = "forYou" | "following";

/** The comment thread under an open row. EXPORTED because the Saved screen
 *  (app/saved.tsx) renders the same rows and must open the same thread — a
 *  second copy of this would drift the moment either is touched. */
export function Comments({ item }: { item: FeedItemView }) {
  const { notify } = useConfirm();
  const C = useTheme().palette;
  const { t } = useLang();
  const [list, setList] = useState<CommentView[]>([]);
  const [text, setText] = useState("");
  const load = () => getComments(item.subjectType, item.subjectId).then((r) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const send = async () => {
    if (!text.trim()) return;
    const r = await postComment({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    if (r.error) { notify(t("common.error"), r.error); return; } // don't clear the box on a failed post
    setText(""); load();
  };
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      {list.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <Avatar url={c.author?.avatarUrl} name={c.author?.displayName} handle={c.author?.handle} size={26} />
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body) }}><Text style={{ fontFamily: F.semi, color: C.chalk }}>{c.author?.displayName || `@${c.author?.handle}`} </Text><Text style={{ color: C.ash }}>{c.body}</Text></Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <TextInput value={text} onChangeText={setText} placeholder={t("w.social.commentPlaceholder")} placeholderTextColor={C.ash} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontFamily: F.reg, fontSize: fs.body }} />
        <SButton label={t("w.social.post")} small onPress={send} />
      </View>
    </View>
  );
}

export default function FeedView({ top }: { top?: ReactNode }) {
  const { notify, confirm } = useConfirm();
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItemView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [live, setLive] = useState<LiveAthlete[]>([]);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);

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
    setText(""); setAttachPr(false); setComposing(false); load();
  };

  // "Following" is the honest exit from the ranked feed: other people, newest
  // first, nothing ranked or interleaved.
  const items = useMemo(() => {
    if (!feed) return [];
    return tab === "following" ? feed.filter((i) => !i.mine).slice().sort((a, b) => b.at - a.at) : feed;
  }, [feed, tab]);
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
      <Animated.View style={fade} onLayout={startHubFade}>
      {/* Standing alone the head is the HERO's (a pushed screen has a rail and a
          back affordance); as a Today hub tab it is the SHARED hub masthead —
          the same component Dashboard and Performance render, at the same rung.
          It used to be `fs.headline` 22, a SECTION heading doing a screen
          title's job, with no eyebrow and a subtitle that restated the title.
          "What your friends are training" under a title that says Feed told the
          athlete nothing, so it is cut.

          THE META ROW IS EMPTY HERE, ON PURPOSE. It still renders and still
          reserves its height — that is what keeps the title's y identical
          across the three tabs — but Feed has nothing true to put in it yet.
          The live count would restate the "Now training" strip 30 pt below, and
          an unread count doesn't exist: FeedResponse carries `feed` and `live`
          and nothing that says what is NEW since the last look. Tracked as
          `hub-feed-meta` in capabilities.ts rather than filled with a
          duplicate. */}
      {top && <HubMasthead title={t("w.social.feedTitle")} />}

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
      <FeedLiveStrip live={live} onOpen={(h) => setDrawer(h)} />

      {/* COMPOSER — deliberately underweighted: in this product the workout is
          the post, so the blank page stays a one-line invitation until wanted. */}
      {composing ? (
        <ACard style={cardStack}>
          <TextInput autoFocus value={text} onChangeText={setText} multiline maxLength={500} placeholder={t("w.social.sharePlaceholder")} placeholderTextColor={C.ash} style={{ minHeight: 48, color: C.chalk, fontSize: fs.note, fontFamily: F.reg }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 10 }}>
            <Pressable onPress={() => setAttachPr((v) => !v)}><Text style={{ color: attachPr ? txt(C, colors.lime) : C.ash, fontSize: fs.body, fontFamily: F.bold }}>{attachPr ? "☑" : "☐"} {t("w.social.attachPr")}</Text></Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <SButton label={t("common.cancel")} small ghost onPress={() => { setComposing(false); setText(""); setAttachPr(false); }} />
              <SButton label={posting ? t("w.social.sharing") : t("w.social.share")} small onPress={share} disabled={posting || (!text.trim() && !attachPr)} />
            </View>
          </View>
        </ACard>
      ) : (
        <Pressable onPress={() => setComposing(true)}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
            <Text style={{ color: C.ash, fontFamily: F.reg, fontSize: fs.body }}>{t("w.social.sharePlaceholder")}</Text>
          </View>
        </Pressable>
      )}

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
        onOpenProfile={(h) => setDrawer(h)}
        onKudos={() => cheer(item)}
        onComments={() => setOpen(open === item.id ? null : item.id)}
        onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
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
        {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
      </AuroraScreen>
    );
  }
  return (
    <AuroraScreen
      hero={{ rank: "title", title: t("w.social.feedTitle") }}
      // GUTTER — the app's screen gutter the rows' full-bleed margins assume;
      // the hub shape above uses the same value.
      scroller={(scrollProps: HeroScrollProps) => list({ ...scrollProps, contentContainerStyle: [scrollProps.contentContainerStyle, { paddingHorizontal: GUTTER }] })}
    >
      {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </AuroraScreen>
  );
}
