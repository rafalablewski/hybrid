import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { fmtWeight, relativeTime, type Achievement, type AuroraIconName } from "@hybrid/core";
import { sapi } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { AuroraIcon } from "./icons";

type Entry = { id: string; body: string; createdAt: string };
type Metric = { id: string; measuredAt: string; weightKg: number | null; waistCm: number | null; bodyFatPct: number | null };
type Hl = { key: string; label: string; value: string; icon: AuroraIconName };

// The interactive Profile → Private tab. Owner-only self-tracking with no other
// home: a Cockpit link (analytics live there), Body & progress (measurements +
// a link to the existing progress-photos screen), Journal, and Hidden highlights
// (curate what stays off the public grid). Everything reads/writes the owner-only
// /api routes; free users see the Full upsell on the gated blocks.
export default function PrivateTab({
  isFull,
  earnedPrs,
  achievements,
  hidden,
  onToggleHidden,
}: {
  isFull: boolean;
  earnedPrs: [string, number][];
  achievements: Achievement[];
  hidden: string[];
  onToggleHidden: (key: string, next: boolean) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const units = useLoggerPrefs().units;
  const lime = txt(C, C.lime) as string;

  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginHorizontal: 2, marginBottom: 2 }}>{t("w.account.profile.priv-intro")}</Text>

      {/* Command center — link out, no duplicate analytics */}
      <Row C={C} icon="navigation" tint={C.blue} title={t("w.account.profile.priv-cockpit-t")} sub={t("w.account.profile.priv-cockpit-s")} onPress={() => router.push("/(tabs)/cockpit")} />

      {/* Body & progress — measurements (this API) + the existing photo screen */}
      {isFull ? <BodyBlock C={C} units={units} onPhotos={() => router.push("/progress")} /> : (
        <LockedRow C={C} icon="user-square" tint={C.lime} title={t("w.account.profile.priv-body-t")} sub={t("w.account.profile.priv-body-s")} onUpgrade={() => router.push("/upgrade")} />
      )}

      {/* Journal — private notes */}
      {isFull ? <JournalBlock C={C} /> : (
        <LockedRow C={C} icon="edit" tint={C.violet} title={t("w.account.profile.priv-journal-t")} sub={t("w.account.profile.priv-journal-s")} onUpgrade={() => router.push("/upgrade")} />
      )}

      {/* Hidden highlights — curate what stays off the public grid */}
      <HiddenBlock C={C} earnedPrs={earnedPrs} achievements={achievements} hidden={hidden} onToggle={onToggleHidden} units={units} />

      {/* Visibility at a glance */}
      <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, backgroundColor: C.ink2 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginBottom: 12 }}>{t("w.account.profile.priv-vis-t")}</Text>
        <VisRow C={C} label={t("w.account.profile.priv-vis-only")} labelColor={lime} tags={["HPI", "Body", "Journal"]} />
        <View style={{ height: 9 }} />
        <VisRow C={C} label={t("w.account.profile.priv-vis-followers")} labelColor={C.ash} tags={["PRs", t("w.account.profile.spec-streak"), t("w.account.profile.id-sessions")]} />
        <Pressable onPress={() => router.push("/settings")} hitSlop={8} style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: lime }}>{t("w.account.profile.priv-vis-manage")} →</Text>
        </Pressable>
      </View>
    </View>
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
    ? [latest.weightKg != null ? fmtWeight(latest.weightKg, units) : null, latest.waistCm != null ? `${t("w.account.profile.priv-waist")} ${Math.round(latest.waistCm)}cm` : null].filter(Boolean).join("  ·  ")
    : t("w.account.profile.priv-body-empty");

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, padding: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconChip C={C} icon="user-square" tint={C.lime} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.profile.priv-body-t")}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: latest ? lime : C.ash, marginTop: 2 }}>{latest === undefined ? "…" : summary}</Text>
        </View>
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</Text>
        </Pressable>
      </View>

      {open && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field C={C} value={weight} onChange={setWeight} placeholder={`${t("w.account.profile.priv-weight")} (${units})`} />
            <Field C={C} value={waist} onChange={setWaist} placeholder={`${t("w.account.profile.priv-waist")} (cm)`} />
          </View>
          <Pressable onPress={save} disabled={busy} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 11, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("common.save")}</Text>}
          </Pressable>
        </View>
      )}

      <Pressable onPress={onPhotos} hitSlop={6} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
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
  const lime = txt(C, C.lime) as string;

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
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, padding: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <IconChip C={C} icon="edit" tint={C.violet} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.profile.priv-journal-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.account.profile.priv-journal-s")}</Text>
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
        <View style={{ marginTop: 12, gap: 10 }}>
          {entries.slice(0, 4).map((e) => (
            <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 19 }}>{e.body}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{relativeTime(Date.parse(e.createdAt))} · {t("w.account.profile.priv-vis-only")}</Text>
                <Pressable onPress={() => del(e.id)} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{t("common.delete")}</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Hidden highlights ─────────────────────────────────────────────────────────
function HiddenBlock({ C, earnedPrs, achievements, hidden, onToggle, units }: { C: Palette; earnedPrs: [string, number][]; achievements: Achievement[]; hidden: string[]; onToggle: (key: string, next: boolean) => void; units: "kg" | "lb" }) {
  const { t } = useLang();
  const items: Hl[] = [
    ...earnedPrs.map(([lift, e1rm]) => ({ key: `pr:${lift}`, label: `${lift} PR`, value: fmtWeight(e1rm, units), icon: "arrow-up" as AuroraIconName })),
    ...achievements.filter((a) => a.earned).map((a) => ({ key: `badge:${a.id}`, label: a.label, value: "", icon: "verified" as AuroraIconName })),
  ];
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, padding: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <IconChip C={C} icon="eye" tint={C.amber} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.profile.priv-hidden-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.account.profile.priv-hidden-s")}</Text>
        </View>
      </View>
      {items.length === 0 ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{t("w.account.profile.priv-hidden-empty")}</Text>
      ) : (
        <View style={{ marginTop: 6 }}>
          {items.map((it) => {
            const isHidden = hidden.includes(it.key);
            return (
              <View key={it.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                <AuroraIcon name={it.icon} size={16} color={isHidden ? C.ash : txt(C, C.lime)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.caption, color: isHidden ? C.ash : C.chalk }}>{it.label}{it.value ? ` · ${it.value}` : ""}</Text>
                </View>
                <Pressable onPress={() => onToggle(it.key, !isHidden)} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: isHidden ? C.line : `${txt(C, C.lime)}66` }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: isHidden ? C.ash : txt(C, C.lime) }}>{isHidden ? t("w.account.profile.priv-show") : t("w.account.profile.priv-hide")}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
function IconChip({ C, icon, tint }: { C: Palette; icon: AuroraIconName; tint: string }) {
  return (
    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${tint}22`, alignItems: "center", justifyContent: "center" }}>
      <AuroraIcon name={icon} size={19} color={txt(C, tint)} />
    </View>
  );
}

function Row({ C, icon, tint, title, sub, onPress }: { C: Palette; icon: AuroraIconName; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13, backgroundColor: C.ink2 }}>
      <IconChip C={C} icon={icon} tint={tint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>›</Text>
    </Pressable>
  );
}

function LockedRow({ C, icon, tint, title, sub, onUpgrade }: { C: Palette; icon: AuroraIconName; tint: string; title: string; sub: string; onUpgrade: () => void }) {
  return (
    <Pressable onPress={onUpgrade} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13, backgroundColor: C.ink2 }}>
      <IconChip C={C} icon={icon} tint={tint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>✦ Full</Text>
      </View>
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

function VisRow({ C, label, labelColor, tags }: { C: Palette; label: string; labelColor: string; tags: string[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 9 }}>
      <Text style={{ width: 70, fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: labelColor }}>{label}</Text>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
        {tags.map((s) => (
          <View key={s} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: 10, color: C.chalk }}>{s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
