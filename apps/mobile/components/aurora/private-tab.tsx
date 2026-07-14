import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { fmtWeight, relativeTime, FUNNEL, type AuroraIconName } from "@hybrid/core";
import { sapi } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { track } from "../../lib/track";
import { fs, F, serifIf } from "../../lib/ui";
import { AuroraIcon } from "./icons";

type Entry = { id: string; body: string; createdAt: string };
type Metric = { id: string; measuredAt: string; weightKg: number | null; waistCm: number | null; bodyFatPct: number | null };

// The interactive Profile → Private tab. Owner-only self-tracking, now on the
// same Jony-Ive material vocabulary as Today: the Command center leads as a
// premium HERO card (the paid intelligence layer — glow + serif title + an
// Unlock/Open CTA, twin of Today's Go-Full Cockpit card), then Body & progress
// and Journal ride refined instrument cards with crafted icon tiles lifted off
// the darker ink, and Privacy & visibility closes as a quiet link out to
// Settings. Body & progress and Journal are FREE (never gated) — only the
// Command center carries the Full unlock. Everything reads/writes the owner-only
// /api routes. Mirrors the web PrivateTab.
export default function PrivateTab({
  isFull,
}: {
  isFull: boolean;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const pa = usePremiumAccent();
  const units = useLoggerPrefs().units;

  return (
    <View style={{ marginTop: 16, gap: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginHorizontal: 2, marginBottom: 2 }}>{t("w.account.profile.priv-intro")}</Text>

      {/* Command center — the paid intelligence layer, led as a premium hero
          (twin of Today's Go-Full Cockpit card). Full → open the Cockpit; free →
          the Unlock upsell (funnelled, not fulfilled). */}
      <CommandCenterCard
        C={C}
        scheme={scheme}
        pa={pa}
        locked={!isFull}
        onPress={() => {
          if (isFull) { router.push("/(tabs)/cockpit"); return; }
          track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "private-cockpit" });
          router.push("/upgrade");
        }}
      />

      {/* Body & progress — FREE. Measurements (this API) + the photo screen. */}
      <BodyBlock C={C} units={units} onPhotos={() => router.push("/progress")} />

      {/* Journal — FREE. Private notes. */}
      <JournalBlock C={C} />

      {/* Privacy & visibility lives in Settings — this is just the way in. */}
      <Row C={C} icon="lock" title={t("w.account.profile.priv-privacy-t")} sub={t("w.account.profile.priv-privacy-s")} onPress={() => router.push("/settings")} />
    </View>
  );
}

// ── Command center (premium hero) ─────────────────────────────────────────────
// The paid intelligence layer, presented like Today's "Go Full" Cockpit card: an
// admin-accent glow blooming from the top-right, a serif title, a crafted icon
// tile, and a CTA that reads "Open" when owned and "Unlock with Full" when not.
function CommandCenterCard({ C, scheme, pa, locked, onPress }: { C: Palette; scheme: "dark" | "light"; pa: ReturnType<typeof usePremiumAccent>; locked: boolean; onPress: () => void }) {
  const { t } = useLang();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("w.account.profile.priv-cockpit-t")} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 20, backgroundColor: C.ink2, overflow: "hidden" }}>
      {/* premium-accent glow (admin-set) blooming from the top-right corner */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${pa.fill}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${pa.fill}2b`, `${pa.fill}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: `${pa.fill}24`, borderWidth: 1, borderColor: `${pa.fill}59`, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="navigation" size={22} color={pa.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, letterSpacing: -0.4, color: C.chalk }}>{t("w.account.profile.priv-cockpit-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.account.profile.priv-cockpit-s")}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase", color: pa.text, marginTop: 18 }}>
        {locked ? `${t("w.home.today.cardUnlock")} →` : `${t("w.home.today.cardOpen")} →`}
      </Text>
    </Pressable>
  );
}

// ── Body & progress ─────────────────────────────────────────────────────────
function BodyBlock({ C, units, onPhotos }: { C: Palette; units: "kg" | "lb"; onPhotos: () => void }) {
  const { t } = useLang();
  const [latest, setLatest] = useState<Metric | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [busy, setBusy] = useState(false);
  const lime = txt(C, C.lime) as string;

  const load = useCallback(() => {
    sapi<{ metrics?: Metric[] }>("/api/body").then((d) => setLatest(d.metrics?.[0] ?? null)).catch(() => setLatest(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const w = parseFloat(weight.replace(",", "."));
    const wc = parseFloat(waist.replace(",", "."));
    // Inputs are in the athlete's display units; the API stores kg + cm.
    const weightKg = Number.isFinite(w) && w > 0 ? (units === "lb" ? w / 2.2046226218 : w) : undefined;
    const waistCm = Number.isFinite(wc) && wc > 0 ? wc : undefined;
    if (weightKg == null && waistCm == null) return;
    setBusy(true);
    await sapi("/api/body", "POST", { weightKg, waistCm });
    setBusy(false); setWeight(""); setWaist(""); setOpen(false); load();
  };

  const summary = latest
    ? [latest.weightKg != null ? fmtWeight(latest.weightKg, units) : null, latest.waistCm != null ? `${t("w.account.profile.priv-waist")} ${Math.round(latest.waistCm)}cm` : null].filter(Boolean).join("    ")
    : t("w.account.profile.priv-body-empty");

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.ink2, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconTile C={C} icon="user-square" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.account.profile.priv-body-t")}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: latest ? lime : C.ash, marginTop: 3 }}>{latest === undefined ? "…" : summary}</Text>
        </View>
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</Text>
        </Pressable>
      </View>

      {open && (
        <View style={{ marginTop: 14, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field C={C} value={weight} onChange={setWeight} placeholder={`${t("w.account.profile.priv-weight")} (${units})`} />
            <Field C={C} value={waist} onChange={setWaist} placeholder={`${t("w.account.profile.priv-waist")} (cm)`} />
          </View>
          <Pressable onPress={save} disabled={busy} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 11, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("common.save")}</Text>}
          </Pressable>
        </View>
      )}

      <Pressable onPress={onPhotos} hitSlop={6} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AuroraIcon name="eye" size={14} color={lime} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: lime }}>{t("w.account.profile.priv-photos")} →</Text>
      </Pressable>
    </View>
  );
}

// ── Journal ─────────────────────────────────────────────────────────────────
function JournalBlock({ C }: { C: Palette }) {
  const { t } = useLang();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    sapi<{ entries?: Entry[] }>("/api/journal").then((d) => setEntries(d.entries ?? [])).catch(() => setEntries([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    await sapi("/api/journal", "POST", { body });
    setBusy(false); setDraft(""); load();
  };
  const del = async (id: string) => { await sapi(`/api/journal?id=${encodeURIComponent(id)}`, "DELETE"); load(); };

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.ink2, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <IconTile C={C} icon="edit" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.account.profile.priv-journal-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.account.profile.priv-journal-s")}</Text>
        </View>
      </View>

      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={t("w.account.profile.priv-journal-ph")}
        placeholderTextColor={C.ash}
        multiline
        style={{ minHeight: 44, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" }}
      />
      {draft.trim().length > 0 && (
        <Pressable onPress={save} disabled={busy} style={{ alignSelf: "flex-start", marginTop: 8, backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{t("w.account.profile.priv-journal-add")}</Text>
        </Pressable>
      )}

      {entries && entries.length > 0 && (
        <View style={{ marginTop: 14, gap: 10 }}>
          {entries.slice(0, 4).map((e) => (
            <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 19 }}>{e.body}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{relativeTime(Date.parse(e.createdAt))}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash, opacity: 0.7 }}>{t("w.account.profile.priv-vis-only")}</Text>
                </View>
                <Pressable onPress={() => del(e.id)} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{t("common.delete")}</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
// A crafted icon tile drawn on the darker ink so it lifts off the card — the same
// material anatomy as Today's deferred rows, so the owner surfaces read as one
// system.
function IconTile({ C, icon }: { C: Palette; icon: AuroraIconName }) {
  return (
    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
      <AuroraIcon name={icon} size={20} color={C.ash} />
    </View>
  );
}

function Row({ C, icon, title, sub, onPress }: { C: Palette; icon: AuroraIconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, backgroundColor: C.ink2 }}>
      <IconTile C={C} icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
    </Pressable>
  );
}

function Field({ C, value, onChange, placeholder }: { C: Palette; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.ash}
      keyboardType="decimal-pad"
      style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
    />
  );
}
