import { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView } from "react-native";
import {
  buildExerciseIndex,
  searchExerciseIndex,
  olympicSport,
  olympicSportsByCategory,
  suggestedSports,
  sportTracksDistance,
  sportDistanceUnit,
  parseSportDistance,
  cardioPace,
  cardioDiscipline,
  type LoggedSession,
  type OlympicSport,
} from "@hybrid/core";
import { createSession } from "../lib/api";
import { saveGuestSession } from "../lib/guest";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { fs, space, F, PressScale as Pressable , tracking} from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { AuroraIcon } from "./aurora/icons";
import { APill, ASearch, AMarkTile, RADIUS } from "./aurora/kit";
import { DeviceMark } from "./aurora/device-mark";
import { DeviceImportSheet } from "./device-import";
import { healthKitAvailability } from "../lib/healthkit";
import { ArrowGlyph } from "./aurora/cta-label";
import { NativeDateField, NativeStepper, LIQUID_GLASS_SUPPORTED } from "./aurora/swiftui";
import Sheet from "./aurora/sheet";
import { SportMark } from "./aurora/icons";

/**
 * Home quick-log — a horizontal CAROUSEL of one-tap sport cards (likely sports +
 * an "Other" card). Tapping a card opens a small sheet to enter time (+ distance
 * for distance sports) and Log, which saves a real cardio session straight away
 * so "back from a run → tap → log → done" never leaves Home. Mirrors the web
 * quick-sport.tsx carousel.
 */
// Carousel cards use punchy short labels (the sheet/log keeps the real sport
// name) — "Running" → "Run", "Cycling" → "Ride", etc.
const SHORT: Record<string, string> = { Running: "Run", Cycling: "Ride", Swimming: "Swim", Rowing: "Row", Walking: "Walk", Hiking: "Hike" };
const shortSport = (name: string) => SHORT[name] ?? name;

export default function QuickSportLog({ sessions = [], onSaved, date }: {
  sessions?: LoggedSession[];
  onSaved?: () => void;
  solid?: boolean;
  /** The day this log lands on, as a timestamp. Absent → now, which is what a
   *  quick log always used to be. Present when the athlete opened this from a
   *  day they had scrubbed to: a sport they played on Saturday belongs on
   *  Saturday, and until the log could take a date the card had nothing to
   *  offer on any day but today. */
  date?: number | null;
}) {
  const C = useTheme().palette;
  const { t } = useLang();

  const suggested = useMemo(() => {
    const seen = new Set<string>();
    return [...suggestedSports(sessions), "Running", "Cycling", "Swimming"].filter((n) => (seen.has(n) ? false : (seen.add(n), true))).slice(0, 4);
  }, [sessions]);

  const [sheetSport, setSheetSport] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The bar is offered wherever a health store can be read; the sheet itself
  // explains the miss (Expo Go / Android) rather than the bar hiding silently.
  // A guest is the one real exclusion: an import writes through the backend, so
  // there is nowhere to put it until they have an account.
  const { session: account } = useSession();
  const canImport = !!account && healthKitAvailability() !== "wrong-platform";

  // BROWSE is grouped by category; SEARCH is one ranked list. Same engine as the
  // exercise picker (@hybrid/core ranked-search) — this used to be its own
  // `name.includes(q)`, which is why "swiming" or "bike" found nothing here
  // while the picker two screens away handled both.
  const groups = useMemo(() => olympicSportsByCategory().filter((g) => g.sports.length > 0), []);
  const index = useMemo(
    () => buildExerciseIndex(groups.flatMap((g) => g.sports.map((s) => s.name))),
    [groups],
  );
  // The sports this athlete actually logs lead the list, exactly as their lifts
  // do in the exercise picker.
  const uses = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sessions) for (const b of s.blocks) if (olympicSport(b.name)) out[b.name] = (out[b.name] ?? 0) + 1;
    return out;
  }, [sessions]);
  const results = useMemo(
    () => (query.trim() ? searchExerciseIndex(index, query, { limit: 30, uses }).map((h) => olympicSport(h.name)!).filter(Boolean) : []),
    [query, index, uses],
  );

  const pickSport = (name: string) => { setPickerOpen(false); setQuery(""); setSheetSport(name); };
  // A searched row has lost its category heading, so it carries its own: the
  // distance unit where there is one, else the sport's family.
  const sportHint = (s: OlympicSport) => (sportTracksDistance(s.name) ? sportDistanceUnit(s.name) : s.category);
  const sportRow = (s: OlympicSport, hint: string) => (
    <Pressable key={s.name} onPress={() => pickSport(s.name)} accessibilityRole="button" accessibilityLabel={s.name}
      style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
      {/* The same 40dp square the exercise picker's rows wear — this sheet is
          that sheet's twin (pick a sport / pick a lift), and it had been the one
          drawing bare glyphs. */}
      <AMarkTile><SportMark sport={s.name} size={fs.subtitle + 4} color={C.chalk} /></AMarkTile>
      <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{s.name}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{hint}</Text>
    </Pressable>
  );

  const card = { flexGrow: 1, flexBasis: "45%", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16 } as const;

  return (
    <>
      {/* IMPORT FROM THE WATCH — first, above the typing. If the training was
          already recorded on the wrist there is nothing to type at all. */}
      {canImport && (
        <Pressable
          onPress={() => setImportOpen(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 10 }}
        >
          <DeviceMark provider="apple" form="mark" height={13} on="dark" label="" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("device.import.cardTitle")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("device.import.cardSub")}</Text>
          </View>
          <ArrowGlyph size={15} color={txt(C, C.lime)} />
        </Pressable>
      )}

      <DeviceImportSheet
        sessions={sessions}
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => onSaved?.()}
      />

      {/* 2×2 grid of one-tap sport cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {suggested.map((name) => (
          <Pressable key={name} onPress={() => setSheetSport(name)} style={card}>
            <SportMark sport={name} size={fs.display} color={C.chalk} />
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk, marginTop: 8 }}>{shortSport(name)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginTop: 4 }}>{t("w.home.today.w.tapLog")}</Text>
          </Pressable>
        ))}
      </View>
      {/* Other — a full-width tile that opens the searchable picker for any sport */}
      <Pressable onPress={() => setPickerOpen(true)} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 15 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>＋</Text>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.home.quickSport.other")}</Text>
      </Pressable>

      {/* Searchable sport chooser → hands the pick to the log sheet */}
      {/* `fill` — the sport list below is a flexing ScrollView, which collapses
          to nothing in a content-sized panel (see Sheet's `fill`). */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={t("w.home.quickSport.choose")} scroll={false} fill>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginBottom: 16 }}>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.quickSport.close")}</Text>
              </Pressable>
            </View>
            <ASearch
              value={query}
              onChange={setQuery}
              placeholder={t("w.home.quickSport.search")}
              autoFocus
              onSubmit={() => { const top = results[0]; if (top) pickSport(top.name); }}
            />
            {/* paddingVertical only — the Sheet's own bottom pad sits below. */}
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingVertical: 8 }}>
              {query.trim() ? (
                results.map((s) => sportRow(s, sportHint(s)))
              ) : (
                groups.map((g) => (
                  <View key={g.category} style={{ marginBottom: 6 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), marginTop: 10, marginBottom: 4 }}>{g.category}</Text>
                    {g.sports.map((s) => sportRow(s, sportHint(s)))}
                  </View>
                ))
              )}
              {query.trim() !== "" && results.length === 0 && (
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, textAlign: "center", marginTop: 28 }}>{t("w.train.picker.noMatch")}</Text>
              )}
            </ScrollView>
      </Sheet>

      {/* Log sheet — minutes (+ distance) and Log, for the chosen sport */}
      <LogSheet sport={sheetSport} date={date} onClose={() => setSheetSport(null)} onSaved={() => { setSheetSport(null); onSaved?.(); }} />
    </>
  );
}

function LogSheet({ sport, date, onClose, onSaved }: { sport: string | null; date?: number | null; onClose: () => void; onSaved: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // WHEN it happened. Seeded from the day the athlete was looking at (a scrubbed
  // day arrives at local noon, so a timezone can't slide it into the day next
  // door), then editable through the system's own calendar. Clamped at now: a
  // logbook holds evidence, and there is none from the future.
  const [when, setWhen] = useState<Date>(() => new Date(date ?? Date.now()));
  useEffect(() => { if (sport) setWhen(new Date(date ?? Date.now())); }, [sport, date]);
  const backdated = !!date && new Date(date).toDateString() !== new Date().toDateString();

  const name = sport ?? "";
  const meta = olympicSport(name);
  const tracksDist = name ? sportTracksDistance(name) : false;
  const km = parseSportDistance(distance, name);
  const pace = cardioPace({ name, distance: km, minutes: parseFloat(minutes) });

  const field = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 } as const;

  const close = () => { setMinutes(""); setDistance(""); setMsg(""); onClose(); };

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) { setMsg(t("w.home.quickSport.needValue")); return; }
    setSaving(true); setMsg("");
    // The chosen moment, never `new Date()` — that stamp was the time the RECORD
    // was typed presented as a property of the workout, which is exactly why a
    // sport could only ever land on today.
    const at = new Date(Math.min(when.getTime(), Date.now())).toISOString();
    const payload = { title: name, startedAt: at, completedAt: at, blocks: [{ kind: "cardio" as const, name, discipline: cardioDiscipline(name), ...(km != null ? { distance: km } : {}), ...(Number.isFinite(mins) ? { minutes: mins } : {}) }] };
    const ok = guest ? (await saveGuestSession(payload), true) : await createSession(payload);
    if (!ok) await saveGuestSession(payload);
    setSaving(false);
    setMinutes(""); setDistance("");
    onSaved();
  };

  // Sheet already lifts the panel above the keyboard — these inputs autofocus
  // and sit at the very bottom, which is what the hand-rolled
  // KeyboardAvoidingView here was for.
  return (
    <Sheet visible={!!sport} onClose={close}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
            {/* 36dp — the card/sheet-header rung, the same one the logger's
                exercise card and the Builder's block card take. */}
            {!!meta && <AMarkTile size={36}><SportMark sport={meta.name} size={fs.subtitle + 2} color={C.chalk} /></AMarkTile>}
            <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{name}</Text>
            <Pressable onPress={close} hitSlop={10}><Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.quickSport.close")}</Text></Pressable>
          </View>

          {/* WHEN — the system's own calendar (SwiftUI DatePicker, compact), so
              a match played on Saturday can be recorded as Saturday's. Shown
              whenever the log arrives from a scrubbed day, and on demand
              otherwise; off-iOS the row states the day it will save to rather
              than offering a control the platform can't draw natively. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms, marginTop: 14, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label") }}>{t("w.home.quickSport.when")}</Text>
            {LIQUID_GLASS_SUPPORTED ? (
              <NativeDateField
                value={when}
                onChange={setWhen}
                latest={new Date()}
                label={t("w.home.quickSport.when")}
                tintColor={C.lime}
              />
            ) : (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: backdated ? txt(C, C.lime) : C.ash }}>
                {when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </Text>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end", marginTop: 10 }}>
            {tracksDist && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginBottom: 6 }}>{sportDistanceUnit(name) === "m" ? t("workout.distM") : t("workout.dist")}</Text>
                <TextInput value={distance} onChangeText={setDistance} keyboardType="numeric" placeholder={sportDistanceUnit(name) === "m" ? "400" : "8"} placeholderTextColor={C.ash} autoFocus style={field} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginBottom: 6 }}>Minutes</Text>
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="numeric" placeholder="45" placeholderTextColor={C.ash} autoFocus={!tracksDist} style={field} />
            </View>
            {/* The shared pill, not a hand-rolled one. This call site was the
                exact pattern APill's commit state exists for: the label swapped
                to "…" while saving, and "Log →" and "…" are different widths, so
                the button resized under the finger still resting on it. APill
                lays the idle label out invisibly to HOLD the width and cross-fades
                the state on top, so it cannot resize. (capabilities
                `cta-pill-convergence`.) */}
            <APill label={t("w.home.quickSport.log")} onPress={save} state={saving ? "saving" : "idle"} />
          </View>
          {/* Nudge the duration in fives — SwiftUI's own Stepper, which brings
              repeat-on-hold, disabled ends and the adjustable VoiceOver trait
              that a pair of hand-drawn ± buttons never gets. Additive: the field
              above stays the exact-entry path and is the only one off-iOS, so
              nothing depends on the native layer having rendered. */}
          {LIQUID_GLASS_SUPPORTED && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms, marginTop: 12 }}>
              <NativeStepper
                label={`${Number.isFinite(parseFloat(minutes)) ? parseFloat(minutes) : 0} min`}
                value={Number.isFinite(parseFloat(minutes)) ? parseFloat(minutes) : 0}
                step={5}
                min={0}
                max={600}
                onChange={(v) => setMinutes(String(v))}
                fontFamily={F.mono}
                fontSize={13}
                fg={C.ash}
                tintColor={C.lime}
              />
            </View>
          )}
          {(pace || msg) && (
            <Text accessibilityLiveRegion={msg ? "polite" : "none"} style={{ fontFamily: F.mono, fontSize: fs.caption, marginTop: 10, color: msg ? C.ash : txt(C, C.lime) }}>
              {msg || `${t("workout.pace")} ${pace}`}
            </Text>
          )}
    </Sheet>
  );
}
