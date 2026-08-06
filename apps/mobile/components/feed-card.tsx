import type { ReactNode } from "react";
import { View, Text, type TextStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  feedStatText,
  feedTierChip,
  type FeedDetail,
  type FeedItemView,
  type FeedStat,
  type WeightUnit,
} from "@hybrid/core";
import { colors } from "@hybrid/core";
import { F, fs, leading, tracking, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { Avatar } from "./social-kit";
import { ACard, RADIUS } from "./aurora/kit";

/**
 * THE FEED CARD (mobile) — twin of apps/web/components/feed-card.tsx. Both
 * render the SAME `FeedDetail` computed in core (packages/core/src/feed-card.ts),
 * so the zones, the moment weighting and the provenance rules are one
 * implementation with two renderers.
 *
 * See the web file for the zone map; the rules are identical here:
 * one accent per card, moment drives weight, the tier chip proves the FIGURE
 * (the tick proves the person), tier 0 wears no badge, and a device-measured
 * figure carries the watch signature.
 */

const ACCENT_FILL: Record<string, string> = {
  lime: colors.lime,
  blue: colors.blue,
  violet: colors.violet,
  amber: colors.amber,
  red: colors.red,
};

export function WatchGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={13} viewBox="0 0 11 14" fill="none">
      <Rect x={1.5} y={3.2} width={8} height={7.6} rx={2.4} stroke={color} strokeWidth={1.3} />
      <Path d="M3.5 3V1.2h4V3M3.5 11v1.8h4V11" stroke={color} strokeWidth={1.3} />
    </Svg>
  );
}

function Bolt({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M8.8 1.5 3.6 9h3.2l-.9 5.5L11.4 7H8.1Z" fill={filled ? color : "none"} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

function Bubble({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M13.5 7.2c0 2.9-2.5 5-5.5 5-.7 0-1.4-.1-2-.3L2.7 13l.6-2.6a5 5 0 0 1-1.3-3.2c0-2.9 2.5-5 5.5-5s6 2.1 6 5Z" fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

/** A mono uppercase chip. `tone` is a brand accent constant; undefined = ash. */
export function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  const C = useTheme().palette;
  const col = tone ? txt(C, tone) : C.ash;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: tone ? col : C.line, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" }}>
      {typeof children === "string" ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: col }}>{children.toUpperCase()}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function StatRow({ stats, units }: { stats: FeedStat[]; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  if (!stats.length) return null;
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 12 }}>
      {stats.map((s) => (
        <View key={s.key} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {s.device ? <WatchGlyph color={C.ash} /> : null}
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "600", color: s.key === "hr" ? txt(C, colors.blue) : C.chalk }}>{feedStatText(s, units)}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash, marginTop: 2 }}>{t(FEED_STAT_LABEL_KEY[s.key]).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function TopSets({ sets, units }: { sets: NonNullable<FeedDetail["sets"]>; units: WeightUnit }) {
  const C = useTheme().palette;
  if (!sets.length) return null;
  return (
    <View style={{ marginTop: 10 }}>
      {sets.map((l, i) => {
        const load = l.loadKg != null ? feedFigureText(l.loadKg, units) : null;
        return (
          <View
            key={`${l.name}-${i}`}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 7, borderBottomWidth: i === sets.length - 1 ? 0 : 1, borderBottomColor: C.line }}
          >
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{l.name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "600", color: C.chalk }}>
              {l.sets} × {l.reps}
              {load ? <Text style={{ color: C.ash }}>{` — ${load.value} ${load.unit}`}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Figure({ detail, units }: { detail: FeedDetail; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const tier = feedTierChip(detail.tier);
  const fig = detail.figureKg != null && detail.figureKg > 0 ? feedFigureText(detail.figureKg, units) : null;
  const e1 = detail.e1rmKg != null ? feedFigureText(detail.e1rmKg, units) : null;
  const deltaLine = [
    e1 ? t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`) : null,
    detail.deltaPct != null ? feedDeltaText(detail.deltaPct) : null,
  ].filter(Boolean).join(" ");
  return (
    <>
      {fig || tier ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          {fig ? (
            <>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, lineHeight: leading(fs.stat, "tight"), letterSpacing: tracking.display, color: C.chalk }}>{fig.value}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: C.ash }}>{fig.unit}</Text>
            </>
          ) : null}
          {/* Provenance sits on the FIGURE's line, never beside the name. */}
          {tier ? (
            <View style={{ marginLeft: "auto" }}>
              <Chip tone={colors.lime}>{`${tier.short} ${t(tier.labelKey)}`}</Chip>
            </View>
          ) : null}
        </View>
      ) : null}
      {deltaLine || detail.firstEver ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: detail.deltaPct != null ? txt(C, colors.lime) : C.ash, marginTop: 6 }}>
          {deltaLine}
          {detail.firstEver ? <Text style={{ color: C.ash }}>{deltaLine ? " — " : ""}{t("feed.firstEver")}</Text> : null}
        </Text>
      ) : null}
    </>
  );
}

export interface FeedCardProps {
  item: FeedItemView;
  units: WeightUnit;
  onOpenProfile: (handle: string) => void;
  onKudos: () => void;
  onComments: () => void;
  onDelete?: () => void;
  children?: ReactNode;
}

export default function FeedCard({ item, units, onOpenProfile, onKudos, onComments, onDelete, children }: FeedCardProps) {
  const C = useTheme().palette;
  const { t } = useLang();
  const d = item.detail;
  const moment = d?.moment ?? "p2";
  const accentFill = ACCENT_FILL[item.accent ?? "lime"] ?? colors.lime;

  const headline = d
    ? d.headlineKey === "feed.hl.session" || d.headlineKey === "feed.hl.sharedWorkout"
      ? d.headlineArg || t(d.headlineKey)
      : d.headlineArg
        ? t(d.headlineKey).replace("{lift}", d.headlineArg)
        : t(d.headlineKey)
    : item.lead || item.title;

  const headlineStyle: TextStyle =
    moment === "p0"
      ? { fontFamily: F.black, fontSize: fs.headline, lineHeight: leading(fs.headline, "tight"), letterSpacing: tracking.display }
      : { fontFamily: F.bold, fontSize: fs.title, lineHeight: leading(fs.title, "snug") };

  // A spaced en dash joins the meta line — never a middot.
  const meta = [item.author.handle ? `@${item.author.handle}` : null, item.when].filter(Boolean).join(" – ");

  return (
    <ACard style={{ marginBottom: 12, ...(moment === "p0" ? { borderColor: txt(C, accentFill) } : null) }}>
      {/* ZONE A — identity */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => onOpenProfile(item.author.handle)}>
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={40} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
            {item.author.displayName || (item.author.handle ? `@${item.author.handle}` : t("w.social.you"))}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{meta}</Text>
        </View>
        {item.subjectType === "post" && item.mine && onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8}><Text style={{ color: C.ash, fontSize: fs.title }}>×</Text></Pressable>
        ) : null}
      </View>

      {/* ZONE B — headline */}
      {headline ? <Text style={{ ...headlineStyle, color: C.chalk, marginTop: 12 }}>{headline}</Text> : null}

      {/* ZONE C — figures */}
      {d?.archetype === "stat" ? <Figure detail={d} units={units} /> : null}
      {d?.prCount ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6 }}>{t("feed.prCount").replace("{n}", String(d.prCount))}</Text> : null}
      {d?.sets && d.sets.length > 0 ? <TopSets sets={d.sets} units={units} /> : null}
      {d?.stats && d.stats.length > 0 ? <StatRow stats={d.stats} units={units} /> : null}

      {/* ZONE E — words */}
      {item.body ? <Text style={{ color: d?.archetype === "text" ? C.chalk : C.ash, fontSize: fs.body, lineHeight: leading(fs.body), marginTop: 10 }}>{item.body}</Text> : null}

      {/* Legacy chips — only when core had no structured detail to give. */}
      {!d && (item.chips?.length ?? 0) > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {item.chips.map((c, i) => <Chip key={i}>{c}</Chip>)}
        </View>
      ) : null}

      {/* ZONE F — actions */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
        <Pressable onPress={onKudos}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Bolt color={item.kudosedByMe ? txt(C, colors.lime) : C.ash} filled={item.kudosedByMe} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: item.kudosedByMe ? txt(C, colors.lime) : C.ash }}>
              {item.kudos > 0 ? String(item.kudos) : t("feed.kudos")}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onComments}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Bubble color={C.ash} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{item.comments > 0 ? String(item.comments) : t("w.social.comment")}</Text>
          </View>
        </Pressable>
      </View>

      {children}
    </ACard>
  );
}
