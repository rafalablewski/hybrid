import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  feedHeadlineText,
  feedSubjectKey,
  parseFeedSubjectKey,
  seedPerson,
  userPagePath,
  type FeedItemView,
  type Relation,
} from "@hybrid/core";
import { F, fs, leading, Loading, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen } from "../components/aurora/kit";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { getFeedPost, toggleKudos } from "../lib/social-api";
import { Avatar, Empty } from "../components/social-kit";
import { Comments } from "../components/feed-comments";
import { FeedActions } from "../components/feed-card";
import { FeedWorkout } from "../components/feed-workout";
import FeedMenu, { feedMenuFor, type FeedMenuAnchor } from "../components/feed-menu";

/**
 * THE POST (mobile) — twin of apps/web/components/feed-post.tsx.
 *
 * A workout is ONE post, and this is the post: who trained, the whole workout
 * (every figure, every record it set, every exercise and every set), the same
 * actions the row carries, and the thread — on a screen of its own, the way an
 * X or Facebook post is a page rather than a peek.
 *
 * It replaced a bottom sheet, and the difference is not decoration:
 *   • a sheet has no address. This screen is `/post?type=…&id=…` (core
 *     `feedPostPath`), so a shared link, a notification and a back-stack entry
 *     all point at the post itself.
 *   • a sheet borrowed the row's data, so it could only open a post the feed
 *     had already loaded. This screen fetches the post
 *     (/api/social/post/[type]/[id]), which is what makes a link work for
 *     someone who has never scrolled past it.
 *   • YOUR OWN workout opens here too. It used to detour into History's session
 *     detail — a different screen with a different shape for the same post —
 *     so the thing you shared was not the thing you could see. The manage
 *     actions still live in History and the post keeps a quiet door to them.
 */
export default function PostScreen() {
  const C = useTheme().palette;
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const params = useLocalSearchParams<{ type?: string; id?: string; key?: string }>();
  // Either shape resolves: two params (what `feedPostPath` writes) or the one
  // `type:id` key kudos, comments and saves already use.
  const ref = parseFeedSubjectKey(typeof params.key === "string" ? params.key : `${params.type ?? ""}:${params.id ?? ""}`);
  const [menu, setMenu] = useState<FeedMenuAnchor | null>(null);
  // The comment button has nothing to expand here — the thread is already open
  // below — so it puts the cursor in the box instead.
  const [focusBox, setFocusBox] = useState(0);

  const q = useQuery({
    queryKey: ["feed-post", ref ? feedSubjectKey(ref) : null],
    queryFn: () => getFeedPost(ref!.subjectType, ref!.subjectId),
    enabled: !!ref,
    staleTime: 60_000,
  });

  // The counts are LOCAL after the first interaction: a kudos must never wait
  // on the network to look given, and a posted comment updates the count beside
  // the thread it just landed in.
  const [live, setLive] = useState<FeedItemView | null>(null);
  useEffect(() => { if (q.data?.item) setLive(q.data.item); }, [q.data]);
  const item = live;

  const cheer = async () => {
    if (!item) return;
    setLive({ ...item, kudos: item.kudos + (item.kudosedByMe ? -1 : 1), kudosedByMe: !item.kudosedByMe });
    const r = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setLive((x) => (x ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x));
  };
  const authorChanged = ({ blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) => {
    // A blocked author's post is not something to keep reading — the server has
    // already made it invisible everywhere else.
    if (blocked) router.back();
  };

  const hero = { rank: "title" as const, title: t("feed.post.title") };

  if (!ref) {
    return <AuroraScreen hero={hero} backLabel={t("feed.post.back")}><Empty title={t("feed.post.missing")} /></AuroraScreen>;
  }
  if (!item) {
    const err = q.data?.error === "private" ? t("feed.session.private") : q.isError || q.data?.error ? t("feed.post.missing") : null;
    return (
      <AuroraScreen hero={hero} backLabel={t("feed.post.back")}>
        {err ? <Empty title={err} /> : <Loading />}
      </AuroraScreen>
    );
  }

  const headline = feedHeadlineText(item, t);
  const session = q.data?.session;
  const menuRows = feedMenuFor({ mine: item.mine, subjectType: item.subjectType, canDelete: false });

  return (
    <AuroraScreen hero={hero} backLabel={t("feed.post.back")}>
      {/* WHO — the same identity block the row carries, one size up: on a
          screen of its own the post is the only thing here, so the person
          leads it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => { if (item.author.handle) { seedPerson(item.author); router.push(userPagePath(item.author.handle)); } }}>
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={44} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
            {item.author.displayName || (item.author.handle ? `@${item.author.handle}` : t("w.social.you"))}
          </Text>
          {/* A spaced en dash joins the meta line — never a middot. */}
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
            {[item.author.handle ? `@${item.author.handle}` : null, item.when].filter(Boolean).join(" – ")}
          </Text>
        </View>
        {menuRows.length > 0 ? (
          <MoreButton onOpen={setMenu} label={t("feed.menu.title")} color={C.ash} />
        ) : null}
      </View>

      {/* The caption the athlete wrote FOR the feed. The private post-workout
          note is owner-only by schema and never arrives here. */}
      {item.body ? <Text style={{ fontFamily: F.reg, color: C.ash, fontSize: fs.body, lineHeight: leading(fs.body), marginTop: 12 }}>{item.body}</Text> : null}

      <View style={{ marginTop: 12 }}>
        {session ? (
          // The whole workout: the figures, the records, then the ledger.
          <FeedWorkout session={session} units={units} prs={item.detail?.prs ?? []} />
        ) : q.isLoading ? (
          <Loading />
        ) : headline ? (
          // A status post has no workout behind it — its headline IS the post.
          <Text style={{ fontFamily: F.black, fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: C.chalk }}>{headline}</Text>
        ) : null}
      </View>

      <FeedActions item={item} headline={headline || item.title} onKudos={cheer} onComments={() => setFocusBox((n) => n + 1)} />

      {/* MY OWN post keeps its manage surface — one quiet door to History's
          full detail (Wrapped, PRs, edit/archive), never a second copy of it. */}
      {item.mine && item.subjectType !== "post" ? (
        <Pressable onPress={() => router.push(`/session/${item.subjectId}`)}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, paddingVertical: 8 }}>{`${t("feed.post.openMine")}  ›`}</Text>
        </Pressable>
      ) : null}

      <Comments item={item} focusSignal={focusBox} onCount={(n) => setLive((x) => (x ? { ...x, comments: n } : x))} />

      <FeedMenu
        anchor={menu}
        onClose={() => setMenu(null)}
        handle={item.author.handle}
        authorId={item.author.id}
        mine={item.mine}
        subjectType={item.subjectType}
        subjectId={item.subjectId}
        relation={item.relation}
        onAuthorChanged={authorChanged}
      />
    </AuroraScreen>
  );
}

/** The ⋯. The menu renders in its own native window, so the glyph's WINDOW rect
 *  has to be measured and handed over (same as the feed row's). */
function MoreButton({ onOpen, label, color }: { onOpen: (a: FeedMenuAnchor) => void; label: string; color: string }) {
  const [node, setNode] = useState<View | null>(null);
  return (
    // collapsable={false} keeps this View in the native tree — RN prunes
    // layout-only Views on Android, and a pruned view cannot be measured.
    <View ref={setNode} collapsable={false}>
      <Pressable
        onPress={() => node?.measureInWindow((x, y, w, h) => onOpen({ x, y, w, h }))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color, paddingHorizontal: 4 }}>⋯</Text>
      </Pressable>
    </View>
  );
}
