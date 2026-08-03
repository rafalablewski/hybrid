import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { routineSummary, type SessionBlock } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, fs, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { withAlpha, ASection } from "./kit";
import Sheet from "./sheet";
import { CtaLabel } from "./cta-label";

/** A saved routine (WorkoutTemplate) as the sheet needs it. */
export type QuickRoutine = {
  id: string;
  name: string;
  blocks: SessionBlock[];
  favourite?: boolean;
};

/**
 * AURORA Quick-start sheet (mobile) — the fourth "Train your way" path. Re-launch
 * a routine you already own in one tap: FAVOURITES ride a snap rail on top
 * (inside the sheet, so they respect its padding — no screen-edge bleed), the
 * rest sit under a shuffle-able "Rediscover" list. Mirrors the web sheet
 * (aurora/quick-start.tsx) on the shared Sheet primitive.
 */
export default function QuickStartSheet({
  visible,
  onClose,
  routines,
  onLaunch,
  onToggleFavourite,
  onBuildNew,
}: {
  visible: boolean;
  onClose: () => void;
  routines: QuickRoutine[];
  onLaunch: (r: QuickRoutine) => void;
  onToggleFavourite: (r: QuickRoutine) => void;
  onBuildNew: () => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(240, Math.round((winW - 40) * 0.66));

  const favourites = useMemo(() => routines.filter((r) => r.favourite), [routines]);
  const rest = useMemo(() => routines.filter((r) => !r.favourite), [routines]);

  // "Rediscover" = the non-favourites in a shuffled order; re-roll on demand.
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder(shuffle(rest.map((r) => r.id)));
  }, [rest]);
  const rediscover = useMemo(() => {
    const byId = new Map(rest.map((r) => [r.id, r] as const));
    const seq = order.map((id) => byId.get(id)).filter(Boolean) as QuickRoutine[];
    for (const r of rest) if (!order.includes(r.id)) seq.push(r);
    return seq;
  }, [rest, order]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.home.quickStart.title")} sub={t("w.home.quickStart.sub")}>
      <View style={{ marginTop: 16 }}>
        {routines.length === 0 ? (
          <View style={{ paddingVertical: 10 }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{t("w.home.quickStart.empty")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash, marginTop: 6, lineHeight: leading(fs.note, "snug") }}>{t("w.home.quickStart.emptySub")}</Text>
          </View>
        ) : (
          <>
            {favourites.length > 0 && (
              <View style={{ marginBottom: rediscover.length > 0 ? 16 : 2 }}>
                <ASection title={`★ ${t("w.home.quickStart.favourites")}`} />
                {/* Favourites rail — snap slider that RESPECTS the sheet padding
                    (no negative-margin bleed): a rail hosted in a Sheet honours
                    its container, per the full-bleed rule. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={cardW + 10}
                  decelerationRate="fast"
                  contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
                >
                  {favourites.map((r) => (
                    <FavouriteCard key={r.id} C={C} scheme={scheme} width={cardW} r={r} t={t} onLaunch={() => onLaunch(r)} onToggleFav={() => onToggleFavourite(r)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {rediscover.length > 0 && (
              <View>
                <ASection
                  title={favourites.length > 0 ? t("w.home.quickStart.rediscover") : t("w.home.quickStart.all")}
                  meta={rediscover.length > 1 ? `↻ ${t("w.home.quickStart.shuffle")}` : undefined}
                  action={rediscover.length > 1 ? () => setOrder(shuffle(rest.map((x) => x.id))) : undefined}
                />
                {rediscover.map((r, i) => (
                  <RoutineRow key={r.id} C={C} first={i === 0} r={r} t={t} onLaunch={() => onLaunch(r)} onToggleFav={() => onToggleFavourite(r)} />
                ))}
              </View>
            )}
          </>
        )}

        <Pressable
          onPress={() => { onClose(); onBuildNew(); }}
          accessibilityRole="button"
          style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 0.9, color: C.ash }}>＋ {t("w.home.quickStart.buildNew")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

type P = ReturnType<typeof useTheme>["palette"];

/** Honest one-liner: "6 moves" (+ " – 34 min" when the routine actually carries
 *  cardio/conditioning minutes). No fabricated durations. */
function metaLine(blocks: SessionBlock[], t: (k: string) => string): string {
  const { moves, minutes } = routineSummary(blocks);
  const movesLabel = moves === 1 ? t("w.home.quickStart.oneMove") : t("w.home.quickStart.moves").replace("{n}", String(moves));
  if (minutes != null) return `${movesLabel} – ${t("w.home.quickStart.min").replace("{n}", String(minutes))}`;
  return movesLabel;
}

const GLYPHS = ["◧", "⬡", "◇", "▦", "◆", "⬢"];
/** A stable per-routine glyph + accent from its id. */
function decor(id: string, C: P): { glyph: string; accent: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const accents = [C.blue, C.lime, C.amber, C.violet];
  return { glyph: GLYPHS[h % GLYPHS.length]!, accent: accents[h % accents.length]! };
}

function Star({ C, on, label, onPress }: { C: P; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ padding: 2 }}>
      <Text style={{ fontSize: 14, color: on ? C.amber : C.ash, opacity: on ? 1 : 0.55 }}>{on ? "★" : "☆"}</Text>
    </Pressable>
  );
}

function FavouriteCard({ C, scheme, width, r, t, onLaunch, onToggleFav }: { C: P; scheme: "dark" | "light"; width: number; r: QuickRoutine; t: (k: string) => string; onLaunch: () => void; onToggleFav: () => void }) {
  const { glyph, accent } = decor(r.id, C);
  return (
    <Pressable onPress={onLaunch} accessibilityRole="button" accessibilityLabel={r.name} style={{ width, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 16, overflow: "hidden" }}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(accent, 0.05) }]} />
      <LinearGradient pointerEvents="none" colors={[withAlpha(accent, 0.18), withAlpha(accent, 0)]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", top: 10, right: 10 }}>
        <Star C={C} on={!!r.favourite} label={t("w.home.quickStart.removeFav")} onPress={onToggleFav} />
      </View>
      <Text style={{ fontSize: 16, lineHeight: 18, color: txt(C, accent) }}>{glyph}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.black), fontSize: 15, letterSpacing: -0.3, color: C.chalk, marginTop: 10, paddingRight: 16 }}>{r.name}</Text>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 5 }}>{metaLine(r.blocks, t)}</Text>
      <CtaLabel label={`${t("w.home.quickStart.start")} →`} color={txt(C, accent)} fontSize={10} font={F.mono} style={{ letterSpacing: 1.2, textTransform: "uppercase", marginTop: 12 }} />
    </Pressable>
  );
}

function RoutineRow({ C, first, r, t, onLaunch, onToggleFav }: { C: P; first: boolean; r: QuickRoutine; t: (k: string) => string; onLaunch: () => void; onToggleFav: () => void }) {
  const { glyph, accent } = decor(r.id, C);
  return (
    <Pressable onPress={onLaunch} accessibilityRole="button" accessibilityLabel={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(accent, 0.13), borderWidth: 1, borderColor: withAlpha(accent, 0.26) }}>
        <Text style={{ fontSize: 15, color: txt(C, accent) }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{r.name}</Text>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 2 }}>{metaLine(r.blocks, t)}</Text>
      </View>
      <Star C={C} on={!!r.favourite} label={r.favourite ? t("w.home.quickStart.removeFav") : t("w.home.quickStart.addFav")} onPress={onToggleFav} />
      <Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ash }}>›</Text>
    </Pressable>
  );
}

/** Fisher–Yates, non-mutating. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
