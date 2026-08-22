import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { sportForDiscipline, type CardioDiscipline } from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { leading, fs, space, F } from "../../lib/ui";
import { AuroraScreen } from "./kit";
import AuroraEnduranceLanes from "./endurance-lanes";

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
 */
export default function AuroraEndurance() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  return (
    <AuroraScreen hero={{ rank: "title", title: t("endurance.title") }} refreshing={refreshing} onRefresh={() => refetch()}>
      {/* NO INTRO PARAGRAPH. It read "Every endurance discipline you train, side
          by side. Open one for its own page." — one sentence describing a
          layout that is visible the instant the sentence is, and one narrating
          an affordance the rails already carry: each ends in a ringed arrow,
          which is this codebase's own promise that the thing leaves. A caption
          explaining an arrow is a caption saying the arrow failed. The screen
          opens on the lanes, which is what the screen is. Mirrors web. */}
      <AuroraEnduranceLanes
        sessions={sessions}
        head={false}
        cap={Infinity}
        canOpen={(d: CardioDiscipline) => !!sportForDiscipline(d)}
        onOpen={(d: CardioDiscipline) => {
          const sport = sportForDiscipline(d);
          if (sport) router.push({ pathname: "/sport-page", params: { name: sport } });
        }}
      />

      {/* The lanes block renders nothing when no endurance is logged — a lane
          exists because something is in it — so the screen states the empty
          case itself. */}
      {sessions.length === 0 && (
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
