"use client";

import { useState } from "react";
import {
  olympicSportsByCategory,
  olympicSport,
  suggestedSports,
  sportTracksDistance,
  sportDistanceUnit,
  parseSportDistance,
  cardioPace,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, ON_ACCENT, disp, cond, mono, Mono, Card } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const field = {
  ...mono,
  fontSize: fs.bodyLg,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "9px 11px",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box" as const,
};

/**
 * Today-dashboard quick-log widget — pick a sport, enter time (+ distance for
 * distance sports), Save. Logs a real session straight to /api/sessions (one
 * cardio activity named after the sport) so "back from a run → log it → done"
 * never leaves the home screen. Distance reads/writes in the sport's natural
 * unit (metres for swimming/rowing); storage stays km. No wearable needed.
 */
export default function QuickSportLog({ sessions = [], onSaved }: { sessions?: LoggedSession[]; onSaved?: () => void }) {
  const { t } = useLang();
  const suggested = suggestedSports(sessions);
  // Until the athlete picks, track the top suggestion — which only resolves once
  // `sessions` has loaded (the prop is empty on first mount), so storing a
  // computed default in state would freeze it on "Running".
  const [picked, setPicked] = useState<string | null>(null);
  const sport = picked ?? suggested[0] ?? "Running";
  const [showAll, setShowAll] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState(""); // in the sport's unit
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // Chips: the suggested shortlist, plus the current pick if it's off-list (so a
  // sport chosen from "More" still shows selected).
  const chips = suggested.includes(sport) ? suggested : [sport, ...suggested];

  const pickChip = (name: string) => { setPicked(name); setShowAll(false); setMsg(""); };

  const tracksDist = sportTracksDistance(sport);
  const km = parseSportDistance(distance, sport);
  const pace = cardioPace({ name: sport, distance: km, minutes: parseFloat(minutes) });

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) {
      setMsg(t("w.home.quickSport.needValue"));
      return;
    }
    setSaving(true);
    setMsg("");
    const block: SessionBlock = {
      kind: "cardio",
      name: sport,
      ...(km != null ? { distance: km } : {}),
      ...(Number.isFinite(mins) ? { minutes: mins } : {}),
    };
    const now = new Date().toISOString();
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sport, startedAt: now, completedAt: now, blocks: [block] }),
      });
      if (res.status === 401) {
        setMsg(t("w.home.quickSport.signIn"));
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setMsg(`${t("w.home.quickSport.saveError")} (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      setMinutes("");
      setDistance("");
      setMsg(`✓ ${t("w.home.quickSport.logged")} ${sport}`);
      setSaving(false);
      onSaved?.();
    } catch {
      setMsg(t("w.home.quickSport.netError"));
      setSaving(false);
    }
  };

  return (
    <Card style={{ borderLeft: `3px solid ${BLUE}` }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
        {t("w.home.quickSport.title")}
      </Mono>
      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>
        {t("w.home.quickSport.sub")}
      </Mono>
      {/* Suggested sports — one tap; "More" reveals the full catalog. */}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginTop: 12 }}>
        {chips.map((name) => {
          const on = name === sport;
          const meta = olympicSport(name);
          return (
            <button
              key={name}
              onClick={() => pickChip(name)}
              style={{ ...cond, fontSize: fs.caption, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? BLUE : LINE}`, background: on ? `${BLUE}22` : INK2, color: on ? CHALK : ASH }}
            >
              {meta && <span style={{ fontSize: fs.body }}>{meta.icon}</span>}
              {name}
            </button>
          );
        })}
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{ ...cond, fontSize: fs.caption, fontWeight: 700, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, background: "transparent", color: ASH }}
        >
          {showAll ? `${t("w.home.quickSport.less")} ▴` : `${t("w.home.quickSport.more")} ▾`}
        </button>
      </div>

      {showAll && (
        <select
          value={sport}
          onChange={(e) => pickChip(e.target.value)}
          autoFocus
          style={{ ...field, width: "100%", cursor: "pointer", marginTop: 8 }}
        >
          {olympicSportsByCategory().map(({ category, sports }) => (
            <optgroup key={category} label={category}>
              {sports.map((s) => (
                <option key={s.name} value={s.name}>{s.icon} {s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        {tracksDist && (
          <div style={{ flex: "0 1 96px" }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={ASH}>
              {t("w.home.quickSport.dist")} ({sportDistanceUnit(sport)})
            </Mono>
            <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder={sportDistanceUnit(sport) === "m" ? "400" : "8"} inputMode="decimal" style={{ ...field, width: "100%" }} />
          </div>
        )}
        <div style={{ flex: "0 1 84px" }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={ASH}>{t("w.home.quickSport.minutes")}</Mono>
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" inputMode="decimal" style={{ ...field, width: "100%" }} />
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 10, padding: "11px 20px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}
        >
          {saving ? t("w.home.quickSport.saving") : t("w.home.quickSport.log")}
        </button>
      </div>
      {(pace || msg) && (
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={msg.startsWith("✓") ? LIME : pace ? BLUE : ASH}>
          {msg || `${t("w.home.quickSport.pace")} ${pace}`}
        </Mono>
      )}
    </Card>
  );
}
