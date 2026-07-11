"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fs,
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  sessionsOnDay,
  FUNNEL,
  type LoggedSession,
  type Biometrics,
  type SessionBlock,
  type AuroraIconName,
} from "@hybrid/core";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;

type Routine = { id: string; name: string; blocks: SessionBlock[] };

/**
 * AURORA Train launcher (web) — the 1:1 twin of the mobile launcher
 * (components/aurora/train.tsx there). MINIMAL: one calm list of ways to start,
 * topped by a single adaptive slot for today's prescribed session — the lime
 * hero before you train, the Premium pitch for free users, or a compact "done"
 * marker once ANY session is logged today. The center Train action in the pill
 * nav opens this; each option seeds the logger via onStart.
 */
export default function AuroraTrainWeb({
  sessions,
  bio,
  onStart,
  onNavigate,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  /** Seed the logger with these blocks (undefined = empty) and open it. */
  onStart: (blocks?: SessionBlock[]) => void;
  /** In-shell navigation — done marker → History, Premium → upgrade sheet. */
  onNavigate: (screen: string) => void;
}) {
  const { t } = useLang();
  const { session } = useSession();
  const isAthlete = usePersona() !== "casual";
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => setRoutines(d.templates ?? []))
      .catch(() => {});
  }, []);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const last = sessions[0];
  const hasHistory = sessions.length > 0;
  // "Any session logged today = done" — shared core helper, same as mobile.
  const doneToday = sessionsOnDay(sessions)[0];
  const prescribedDone = isAthlete && !!doneToday;

  const upsell = (source: string) => { track(FUNNEL.upgradeEntryClick, { client: "web", source }); onNavigate("upgrade"); };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", fontFamily: "var(--font-display)" }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 30, letterSpacing: "-.035em", color: C("chalk") }}>{t("train.title")}</h1>
      <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 8, lineHeight: 1.45 }}>{t("train.intro")}</p>

      {/* THE ADAPTIVE SLOT — done marker · prescribed hero · or Premium pitch. */}
      {prescribedDone && doneToday ? (
        <DoneMarker session={doneToday} onOpen={() => onNavigate("history")} t={t} />
      ) : isAthlete ? (
        <PrescribedHero rx={rx} hasHistory={hasHistory} onStart={() => onStart(rx.blocks as SessionBlock[])} t={t} />
      ) : (
        <PremiumHero onUpsell={() => upsell("train-ai")} t={t} />
      )}

      {/* MINIMAL LIST — the other ways to start. Thin accents, hairline rows. */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), margin: "24px 4px 4px" }}>
        {prescribedDone ? t("train.trainAgain") : t("train.moreWays")}
      </div>
      <div style={{ borderTop: `1px solid ${C("line")}`, borderBottom: `1px solid ${C("line")}` }}>
        {/* Empty session — the always-available free start. */}
        <ListRow
          icon="play"
          iconColor={C("lime")}
          title={t("train.emptySession")}
          bold
          meta={t("train.emptySub")}
          right={<span style={{ width: 7, height: 7, borderRadius: 4, background: C("lime"), display: "inline-block" }} />}
          onClick={() => onStart()}
          first
        />

        {/* Routines — a Premium slot. Athletes see their saved routines (or a
            build prompt); free users get one upsell row. */}
        {isAthlete ? (
          routines.length > 0 ? (
            routines.map((r) => (
              <ListRow
                key={r.id}
                icon="list-check"
                iconColor={C("ash")}
                title={r.name}
                meta={r.blocks.map((b) => b.name).slice(0, 3).join(" · ")}
                right={<Chevron />}
                onClick={() => onStart(r.blocks)}
              />
            ))
          ) : (
            <ListRow icon="list-check" iconColor={C("ash")} title={t("train.fromRoutine")} meta={t("train.buildFirst")} right={<Chevron />} onClick={() => onNavigate("builder")} />
          )
        ) : (
          <ListRow icon="list-check" iconColor={C("ash")} title={t("train.fromRoutine")} premium right={<Chevron />} onClick={() => upsell("train-routine")} />
        )}

        {/* Repeat last — free, only once there's history. */}
        {last && (
          <ListRow icon="swap" iconColor={C("ash")} title={t("train.repeatLast")} meta={last.title} right={<Chevron />} onClick={() => onStart(last.blocks)} />
        )}
      </div>

      {/* Build a reusable routine. */}
      <button
        onClick={() => onNavigate("builder")}
        style={{ width: "100%", marginTop: 16, padding: "14px 0", border: `1px solid ${C("line")}`, borderRadius: 999, background: "transparent", cursor: "pointer", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.note }}
      >
        ＋ {t("train.buildRoutine")}
      </button>

      <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 14, lineHeight: 1.5 }}>{t("train.finishedNote")}</p>
    </div>
  );
}

type T = (k: string) => string;

/** Prescribed session — the big lime hero (athletes, not yet trained today). */
function PrescribedHero({ rx, hasHistory, onStart, t }: { rx: ReturnType<typeof prescribeSession>; hasHistory: boolean; onStart: () => void; t: T }) {
  const title = hasHistory
    ? `${rx.blocks[0]?.name ?? ""}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`
    : t("train.aiEmptyTitle");
  const blurb = hasHistory ? rx.why : t("train.aiEmptyBlurb");
  return (
    <button
      onClick={onStart}
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: C("lime"), borderRadius: 24, padding: 22, marginTop: 18, color: C("ink") }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.62, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {t("home.readiness")} {rx.readiness}/100
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 25, letterSpacing: "-.03em", marginTop: 10 }}>{title}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, opacity: 0.7, marginTop: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{blurb}</div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 16, background: C("ink"), color: "var(--lime-text)", borderRadius: 12, padding: "12px 18px", fontWeight: 800, fontSize: fs.note }}>
        <AuroraIcon name="play" size={13} strokeWidth={2.6} color={C("lime")} />{t("train.startSession")}
      </span>
    </button>
  );
}

/** Premium pitch — the adaptive slot for free/casual users (no prescription). */
function PremiumHero({ onUpsell, t }: { onUpsell: () => void; t: T }) {
  return (
    <button
      onClick={onUpsell}
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: C("ink2"), border: `1px solid color-mix(in srgb, var(--color-violet) 40%, transparent)`, borderRadius: 22, padding: 18, marginTop: 18 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--violet-text)" }}>{t("train.aiCoach")}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle, color: "var(--violet-text)" }}>{t("w.home.today.unlockFullBtn")}</span>
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, color: C("chalk"), marginTop: 8, letterSpacing: "-.02em" }}>{t("train.aiLockedTitle")}</div>
      <div style={{ fontSize: fs.body, color: C("chalk"), marginTop: 6, lineHeight: 1.5 }}>{t("train.aiLockedBlurb")}</div>
    </button>
  );
}

/** Done marker — the collapsed slot once today's work is logged. */
function DoneMarker({ session, onOpen, t }: { session: LoggedSession; onOpen: () => void; t: T }) {
  const names = session.blocks.map((b) => b.name).slice(0, 3).join(", ");
  return (
    <button
      onClick={onOpen}
      style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", cursor: "pointer", background: C("ink2"), border: `1px solid ${C("line")}`, borderLeft: `3px solid ${C("lime")}`, borderRadius: 24, padding: 17, marginTop: 18 }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 22, background: C("lime"), display: "grid", placeItems: "center", flex: "none" }}>
        <AuroraIcon name="check" size={24} strokeWidth={2.8} color={C("ink")} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--lime-text)" }}>{t("train.done")}</span>
        <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note, color: C("chalk"), marginTop: 5 }}>{session.title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{names || t("train.tapSummary")}</span>
      </span>
      <Chevron />
    </button>
  );
}

/** One hairline list row: icon · title/meta · right slot. */
function ListRow({
  icon, iconColor, title, meta, right, onClick, bold, premium, first,
}: {
  icon: AuroraIconName;
  iconColor: string;
  title: string;
  meta?: string;
  right?: ReactNode;
  onClick: () => void;
  bold?: boolean;
  premium?: boolean;
  first?: boolean;
}) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 15, width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none", borderTop: first ? "none" : `1px solid ${C("line")}`, padding: "18px 2px" }}
    >
      <span style={{ width: 24, display: "grid", placeItems: "center", flex: "none" }}>
        <AuroraIcon name={icon} size={19} strokeWidth={2.2} color={iconColor} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: bold ? 800 : 700, fontSize: fs.note, color: C("chalk"), letterSpacing: "-.01em" }}>{title}</span>
        {!!meta && <MetaLine text={meta} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4 }} />}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
        {premium && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--violet-text)", border: `1px solid color-mix(in srgb, var(--color-violet) 45%, transparent)`, borderRadius: 6, padding: "4px 6px" }}>{t("train.premium")}</span>
        )}
        {right}
      </span>
    </button>
  );
}

function Chevron() {
  return <span style={{ fontSize: 18, color: C("ash"), opacity: 0.7 }}>›</span>;
}
