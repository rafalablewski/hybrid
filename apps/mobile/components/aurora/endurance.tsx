import { useMemo } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { sportForDiscipline, sportPages, type SportPage } from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { leading, fs, space, F } from "../../lib/ui";
import { AuroraScreen } from "./kit";
import AuroraSportPages from "./sport-pages";

/**
 * AURORA Endurance — the COMPARISON.
 *
 * This screen used to be per-discipline analytics behind a chip picker. Every
 * one of those numbers now lives on the sport's OWN page (sport-page.tsx), read
 * in that sport's units and carrying its transfer work besides — so the hub was
 * answering the same question in a second place, and the two would have drifted.
 *
 * One destination per depth, and this is the widest:
 *
 *   ALL your endurance (here) → ONE sport (the sport page) → ONE move (the
 *   exercise page, which owns per-move pace analytics).
 *
 * WHICH IS WHY THE SECTION IS A GRID and no longer a swiped pager. If this
 * screen's job is the widest view, then showing exactly one sport at a time was
 * the layout arguing with the hierarchy above it — the depth is already one tap
 * down, so the only thing this level can add is the COMPARISON, and a
 * comparison needs its subjects on screen together.
 */
export default function AuroraEndurance() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  const pages = useMemo(() => sportPages(sessions), [sessions]);

  /** A page opens the sport it is about. A discipline resolves to its catalog
   *  sport; a ball sport already IS one. */
  const open = (page: SportPage) => {
    const name = page.sport ?? (page.discipline ? sportForDiscipline(page.discipline) : null);
    if (name) router.push({ pathname: "/sport-page", params: { name } });
  };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("endurance.title") }} refreshing={refreshing} onRefresh={() => refetch()}>
      {/* NO INTRO PARAGRAPH. It read "Every endurance discipline you train, side
          by side. Open one for its own page." — one sentence describing a
          layout that is visible the instant the sentence is, and one narrating
          an affordance the pages already carry: each ends in a ringed arrow,
          which is this codebase's own promise that the thing leaves. A caption
          explaining an arrow is a caption saying the arrow failed. The screen
          opens on the sports, which is what the screen is. */}
      <AuroraSportPages pages={pages} onOpen={open} />

      {/* The pager renders nothing when the window is empty — a page exists
          because something is in it — so the screen states the empty case
          itself. */}
      {pages.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: space.huge }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk }}>{t("endurance.emptyTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 10, textAlign: "center", lineHeight: leading(fs.body) }}>
            {t("endurance.emptyBody")}
          </Text>
        </View>
      )}
    </AuroraScreen>
  );
}
