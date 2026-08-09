import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { router } from "expo-router";
import { FEED_SAVED_PAGE, feedPostPath, orderBySaved, seedPerson, userPagePath, type FeedItemView, type KudosResponse, type Relation } from "@hybrid/core";
import { Loading, F, fs, leading, tracking, useScreenBottomPad } from "../lib/ui";
import { AuroraScreen, GUTTER } from "../components/aurora/kit";
import type { HeroScrollProps } from "../components/aurora/hero";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { getSavedFeed, toggleKudos, deletePost } from "../lib/social-api";
import { forgetSavedPosts, syncSaved, useFeedSaved } from "../lib/feed-actions";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useNavScrollProps } from "../lib/nav-scroll";
import { Empty, SButton } from "../components/social-kit";
import { useConfirm } from "../components/aurora/confirm";
import FeedCard from "../components/feed-card";
import { Comments } from "../components/feed-comments";

/**
 * SAVED — the shelf behind the feed's bookmark (mobile). Twin of
 * apps/web/components/social-saved.tsx.
 *
 * Saving shipped before this screen did, which made the bookmark a button that
 * swallowed things: you could mark a session's scheme and there was no surface
 * that listed what you had marked. This is that surface, and it is deliberately
 * the SAME ROW as the feed (feed-card.tsx) — a saved post rendered as some
 * reduced "saved item" summary would be a second card model to keep in step,
 * and you would lose the figures you saved it for.
 *
 * WHERE THE DATA COMES FROM. The device holds the saved KEYS and nothing else,
 * so the screen posts them to /api/social/saved and the server rebuilds the
 * cards from the rows — privacy re-checked at read time. It pages, because
 * resolving a key costs the author's session history.
 *
 * THE TWO MISS LISTS ARE PART OF THE SCREEN, not an error path. A shelf that
 * silently returns fewer cards than you saved is the original failure wearing a
 * list view, so: rows the server reports GONE are pruned from the device (the
 * only way the list shrinks by itself), and rows that merely turned invisible
 * are kept and COUNTED on screen — the author went private or blocked you, and
 * that reverses.
 */
export default function SavedScreen() {
  const C = useTheme().palette;
  const { t } = useLang();
  const { confirm } = useConfirm();
  const units = useLoggerPrefs().units;
  const saved = useFeedSaved();
  const [items, setItems] = useState<FeedItemView[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [shown, setShown] = useState(FEED_SAVED_PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const keys = saved.ids.slice(0, shown);
  const keySig = keys.join(",");

  const load = useCallback(async () => {
    if (keys.length === 0) { setItems([]); setHidden(0); return; }
    const r = await getSavedFeed(keys);
    // Order is the DEVICE's, not the server's: what you remember is when you
    // saved a thing, not when it was posted.
    setItems(orderBySaved(saved, r.items ?? []));
    setHidden((r.hidden ?? []).length);
    if (r.gone?.length) forgetSavedPosts(r.gone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);
  // The shelf reconciles with the server BEFORE it resolves anything: the list
  // this screen pages through must be the account's, not just this device's.
  // Quiet no-op until SavedPost is migrated (lib/feed-actions.ts).
  useEffect(() => { void syncSaved(); }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cheer = async (item: FeedItemView) => {
    // Optimistic, exactly as in the feed: a kudos must never wait on the network.
    setItems((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe } : x)) ?? f);
    const r: KudosResponse = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setItems((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x)) ?? f);
  };
  // The same author change the feed applies — a blocked author's saved rows go
  // too, because the resolve endpoint would return them as `hidden` on the very
  // next load anyway.
  const authorChanged = ({ authorId, relation, blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) =>
    setItems((f) => (blocked
      ? f?.filter((x) => x.author.id !== authorId) ?? f
      : f?.map((x) => (x.author.id === authorId ? { ...x, relation } : x)) ?? f));

  const del = async (item: FeedItemView) => {
    const ok = await confirm({ title: t("w.social.deletePostConfirm"), confirmLabel: t("common.delete"), destructive: true });
    if (!ok) return;
    await deletePost(item.subjectId);
    load();
  };

  const padBottom = useScreenBottomPad();
  const navScroll = useNavScrollProps();

  const renderItem = ({ item }: { item: FeedItemView }) => (
    <FeedCard
      item={item}
      units={units}
      onOpenProfile={(h) => { if (h) { seedPerson(item.author); router.push(userPagePath(h)); } }}
      onKudos={() => cheer(item)}
      onComments={() => setOpen(open === item.id ? null : item.id)}
      // A saved row opens the same post screen the feed's rows open.
      onOpen={() => { setOpen(null); router.push(feedPostPath(item)); }}
      onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
      onAuthorChanged={authorChanged}
    >
      {open === item.id ? <Comments item={item} /> : null}
    </FeedCard>
  );

  // The stream boundary — the same edge-to-edge hairline handover the feed
  // uses, so the first row is bounded top.
  const header = saved.ids.length === 0 ? null : (
    <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: -GUTTER }} />
  );

  const footer = saved.ids.length === 0 ? null : (
    <View style={{ alignItems: "center", paddingTop: 14, paddingBottom: 8, gap: 10 }}>
      {/* Saved, still yours, currently not showable. Counted rather than
          hidden — the alternative is a list that is quietly short. */}
      {hidden > 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, textAlign: "center", maxWidth: 320 }}>
          {t("feed.savedHidden").replace("{n}", String(hidden))}
        </Text>
      ) : null}
      {saved.ids.length > shown ? (
        <SButton label={t("feed.savedMore").replace("{n}", String(saved.ids.length - shown))} onPress={() => setShown((n) => n + FEED_SAVED_PAGE)} />
      ) : (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>
          {t("feed.savedCount").replace("{n}", String(saved.ids.length)).toUpperCase()}
        </Text>
      )}
    </View>
  );

  return (
    <AuroraScreen
      hero={{ rank: "title", title: t("w.social.savedTitle") }}
      // GUTTER — the app's screen gutter the rows' full-bleed margins assume,
      // the same value the feed's own list uses.
      scroller={(scrollProps: HeroScrollProps) => (
        <FlatList
          {...scrollProps}
          {...navScroll}
          data={items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            items === null ? (
              <Loading />
            ) : (
              // The empty state TEACHES the gesture — this screen is reached
              // from a glyph, and an empty shelf that doesn't say what fills it
              // is a dead end.
              <Empty title={t("feed.savedEmpty")} sub={t("feed.savedEmptySub")} />
            )
          }
          contentContainerStyle={[scrollProps.contentContainerStyle, { paddingHorizontal: GUTTER, paddingBottom: padBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          windowSize={11}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.lime} colors={[C.lime]} />}
        />
      )}
    />
  );
}
