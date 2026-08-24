import { useMemo } from "react";
import { Text } from "react-native";
import {
  MAX_SPORT_FAVOURITES,
  isSportFavourite,
  sportChoices,
  sportFavouritesFull,
  sportPageTitle,
  formatDuration,
  durationUnits,
  type LoggedSession,
  type SportPage,
  STATE_OPACITY,
} from "@hybrid/core";
import Sheet from "./sheet";
import { APanel } from "./kit";
import { SportMark } from "./icons";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, FIXED_FONT_SCALE, PressScale as Pressable, fs, tracking, ty } from "../../lib/ui";
import { useSportFavourites, toggleSportFavourite } from "../../lib/sport-favourites";
import { haptic } from "../../lib/haptics";
import { useListMotion } from "../../lib/list-motion";

/**
 * WATCH A SPORT — the Sports board's pin sheet, the exercise pin sheet's twin
 * at sport altitude. It offers only sports the athlete has LOGGED (a board row
 * is an 8-week read; a pin with no history could only draw a blank), pins
 * first so the current selection is visible and removable, then the rest by
 * training time. No search: a history holds a handful of sports, not a
 * catalog.
 *
 * Rows toggle through the shared store; the toggle is armed with list motion
 * because the board BEHIND this sheet re-stacks the moment a pin lands — a row
 * arriving on Today while this panel is up must travel, not teleport.
 */
export default function SportFavouritesSheet({
  visible,
  onClose,
  sessions,
}: {
  visible: boolean;
  onClose: () => void;
  sessions: LoggedSession[];
}) {
  const motion = useListMotion();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const favourites = useSportFavourites();

  const choices = useMemo(() => sportChoices(sessions), [sessions]);
  const pinned = choices.filter((p) => isSportFavourite(favourites, p.key));
  const rest = choices.filter((p) => !isSportFavourite(favourites, p.key));
  const full = sportFavouritesFull(favourites);

  const row = (p: SportPage, last: boolean) => {
    const on = isSportFavourite(favourites, p.key);
    // At the cap an unpinned row can't do anything — dim it and say why (the
    // note above the list) rather than accepting the tap and ignoring it.
    const locked = !on && full;
    const title = sportPageTitle(p, t);
    return (
      <Pressable
        key={p.key}
        onPress={() => {
          if (locked) return;
          haptic.light();
          motion(() => toggleSportFavourite(p.key));
        }}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: locked }}
        accessibilityLabel={`${on ? t("w.home.exw.unpin") : t("w.home.exw.pin")} – ${title}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line, opacity: locked ? STATE_OPACITY.disabled : 1 }}
      >
        <SportMark sport={p.sport ?? title} size={22} color={on ? txt(C, C.lime) : C.ash} />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>
          {title}
        </Text>
        <Text style={ty(C, "kicker")}>{formatDuration(p.minutes, durationUnits(t))}</Text>
        {/* The pinned star rides the amber TEXT tone — the same channel the
            exercise sheet's star wears, so a pin looks like a pin everywhere. */}
        <Text style={{ fontSize: fs.bodyLg, color: on ? txt(C, C.amber) : C.ash, opacity: on ? 1 : 0.55 }}>{on ? "★" : "☆"}</Text>
      </Pressable>
    );
  };

  const slab = (list: SportPage[]) => (
    <APanel style={{ paddingVertical: 4, marginTop: 12 }}>{list.map((p, i) => row(p, i === list.length - 1))}</APanel>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.home.sb.addTitle")} sub={t("w.home.sb.addSub")}>
      {choices.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, paddingVertical: 12 }}>{t("w.home.sb.addEmpty")}</Text>
      ) : (
        <>
          {full && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), color: C.accentText.amber, marginTop: 10 }}>
              {t("w.home.sb.addFull").replace("{n}", String(MAX_SPORT_FAVOURITES))}
            </Text>
          )}
          {pinned.length > 0 && slab(pinned)}
          {rest.length > 0 && slab(rest)}
        </>
      )}
    </Sheet>
  );
}
