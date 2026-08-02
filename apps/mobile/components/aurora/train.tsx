import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  prescribeSession,
  personalTrainingLog,
  velocityProfiles,
  sessionsOnDay,
  type LoggedSession,
} from "@hybrid/core";
import { FUNNEL } from "@hybrid/core";
import { fetchSessions, fetchRoutines, type Routine } from "../../lib/api";
import { useDraft } from "../../lib/draft";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { track } from "../../lib/track";
import { fs, F, PressScale } from "../../lib/ui";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { AuroraScreen, ACard, AHeading, RADIUS, withAlpha } from "./kit";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import type { AuroraIconName } from "@hybrid/core";

/** AURORA Train launcher — MINIMAL: one calm list of ways to start, topped by a
 *  single adaptive slot for today's prescribed session. Before you train that
 *  slot is the hero (or, for free users, the Premium pitch); once ANY session is
 *  logged today it collapses to a compact "done" marker and the list stays so an
 *  extra session is one tap away. Mirrored 1:1 on web (components/aurora/train). */
export default function AuroraTrain() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const { draft, discard } = useDraft();
  const { session } = useSession();
  // AI-prescribed sessions are premium (paid) only — casual/guest are funnelled.
  const isAthlete = usePersona() !== "casual";
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    fetchSessions().then(setSessions);
    fetchRoutines().then(setRoutines);
  }, []);

  const rx = useMemo(
    () =>
      prescribeSession(personalTrainingLog(sessions), undefined, {
        profiles: velocityProfiles(sessions),
      }),
    [sessions],
  );

  const last = sessions[0];
  const hasHistory = sessions.length > 0;
  const start = (source: "empty" | "ai" | "last" | "new") => router.push(`/workout?source=${source}`);
  // One upgrade funnel for the premium AI slot: guests register, free users
  // upgrade — never fabricate premium content.
  const upsell = (source: string) => {
    track(FUNNEL.upgradeEntryClick, { client: "mobile", source });
    router.push(session ? "/upgrade" : "/login?mode=signup");
  };
  const startAI = () => (isAthlete ? start("ai") : upsell("train-ai"));

  // "Any session logged today = done" — today's prescribed work is considered
  // done once anything lands, so the hero steps back to a done marker. Uses the
  // shared core helper (same as web Today) so the clients can't drift.
  const doneToday = sessionsOnDay(sessions)[0];
  const prescribedDone = isAthlete && !!doneToday;

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: 28 }}>{t("train.title")}</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, lineHeight: 20 }}>{t("train.intro")}</Text>

      {/* Resume a workout left in progress — kept above the adaptive slot. */}
      {draft && (
        <ACard style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("train.resume")}</Text>
            <PressScale onPress={discard} hitSlop={8}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("train.discard")}</Text>
            </PressScale>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 8 }}>{draft.title || "Workout"}</Text>
          <View style={{ marginTop: 2 }}><MetaLine parts={[`${draft.exercises.length} ${t("workout.exercises")}`, t("train.inProgress")]} textStyle={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }} /></View>
          <PressScale onPress={() => start("empty")} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center", marginTop: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>▶  {t("train.resume")}</Text>
          </PressScale>
        </ACard>
      )}

      {/* THE ADAPTIVE SLOT — done marker · prescribed hero · or Premium pitch. */}
      {prescribedDone && doneToday ? (
        <DoneMarker C={C} session={doneToday} onPress={() => router.push(`/session/${doneToday.id}`)} t={t} />
      ) : isAthlete ? (
        <PrescribedHero C={C} rx={rx} hasHistory={hasHistory} onPress={() => start("ai")} t={t} />
      ) : (
        <PremiumHero C={C} onPress={() => upsell("train-ai")} t={t} />
      )}

      {/* MINIMAL LIST — the other ways to start. Thin accents, hairline rows. */}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash, marginTop: 22, marginBottom: 4, marginHorizontal: 4 }}>
        {prescribedDone ? t("train.trainAgain") : t("train.moreWays")}
      </Text>
      <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }}>
        {/* Empty session — the always-available free start. */}
        <ListRow
          C={C}
          icon="play"
          iconColor={C.lime}
          title={t("train.emptySession")}
          bold
          meta={t("train.emptySub")}
          right={<View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime }} />}
          onPress={() => start(draft ? "new" : "empty")}
          first
        />

        {/* Routines — free for everyone (a free account keeps up to
            FREE_TEMPLATE_LIMIT saved templates; the Builder upsells past that).
            Saved routines list here, else a build prompt into the Builder. */}
        {routines.length > 0 ? (
          routines.map((r) => (
            <ListRow
              key={r.id}
              C={C}
              icon="list-check"
              iconColor={C.ash}
              title={r.name}
              meta={r.blocks.map((b) => b.name).slice(0, 3).join(" – ")}
              right={<Chevron C={C} />}
              onPress={() => router.push(`/workout?source=template&templateId=${r.id}`)}
            />
          ))
        ) : (
          <ListRow C={C} icon="list-check" iconColor={C.ash} title={t("train.fromRoutine")} meta={t("train.buildFirst")} right={<Chevron C={C} />} onPress={() => router.push("/builder")} />
        )}

        {/* Repeat last — free, only once there's history. */}
        {last && (
          <ListRow C={C} icon="swap" iconColor={C.ash} title={t("train.repeatLast")} meta={last.title} right={<Chevron C={C} />} onPress={() => start("last")} />
        )}
      </View>

      {/* Build a reusable routine. */}
      <PressScale onPress={() => router.push("/builder")} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center", marginTop: 16 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>＋ {t("train.buildRoutine")}</Text>
      </PressScale>

      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12, lineHeight: 19 }}>{t("train.finishedNote")}</Text>
    </AuroraScreen>
  );
}

type T = (k: string) => string;

/** Prescribed session — the big lime hero (athletes, not yet trained today). */
function PrescribedHero({ C, rx, hasHistory, onPress, t }: { C: Palette; rx: ReturnType<typeof prescribeSession>; hasHistory: boolean; onPress: () => void; t: T }) {
  const title = hasHistory
    ? `${rx.blocks[0]?.name ?? ""}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}`
    : t("train.aiEmptyTitle");
  const blurb = hasHistory ? rx.why : t("train.aiEmptyBlurb");
  return (
    <PressScale onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: RADIUS.card, padding: 20, marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: C.onAccent, opacity: 0.62 }} numberOfLines={1}>
        {t("home.readiness")} {rx.readiness}/100
      </Text>
      <Text style={{ fontFamily: F.black, fontSize: 25, lineHeight: 28, color: C.onAccent, marginTop: 10, letterSpacing: -0.5 }}>{title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.onAccent, opacity: 0.68, marginTop: 8, lineHeight: 17 }} numberOfLines={2}>{blurb}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 14, marginTop: 16 }}>
        <AuroraIcon name="play" size={15} color={C.lime} />
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{t("train.startSession")}</Text>
      </View>
    </PressScale>
  );
}

/** Premium pitch — the adaptive slot for free/casual users (no prescription). */
function PremiumHero({ C, onPress, t }: { C: Palette; onPress: () => void; t: T }) {
  const pa = usePremiumAccent();
  return (
    <PressScale onPress={onPress} style={{ marginTop: 16 }}>
      <ACard style={{ borderColor: withAlpha(pa.fill, 0.27) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: pa.text }}>{t("train.aiCoach")}</Text>
          <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: pa.text }}>{t("w.home.today.unlockFullBtn")}</Text>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: 22, lineHeight: 25, color: C.chalk, marginTop: 8 }}>{t("train.aiLockedTitle")}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 19 }} numberOfLines={3}>{t("train.aiLockedBlurb")}</Text>
      </ACard>
    </PressScale>
  );
}

/** Done marker — the collapsed slot once today's work is logged. */
function DoneMarker({ C, session, onPress, t }: { C: Palette; session: LoggedSession; onPress: () => void; t: T }) {
  const names = session.blocks.map((b) => b.name).slice(0, 3).join(", ");
  return (
    <PressScale
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: C.lime, borderRadius: RADIUS.card, padding: 17, marginTop: 16 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
        <AuroraIcon name="check" size={24} color={C.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("train.done")}</Text>
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.chalk, marginTop: 5 }}>{session.title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }} numberOfLines={1}>{names || t("train.tapSummary")}</Text>
      </View>
      <Chevron C={C} />
    </PressScale>
  );
}

/** One hairline list row: icon · title/meta · right slot. */
function ListRow({
  C, icon, iconColor, title, meta, right, onPress, bold, premium, first,
}: {
  C: Palette;
  icon: AuroraIconName;
  iconColor: string;
  title: string;
  meta?: string;
  right?: ReactNode;
  onPress: () => void;
  bold?: boolean;
  premium?: boolean;
  first?: boolean;
}) {
  const { t } = useLang();
  const pa = usePremiumAccent();
  return (
    <PressScale
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 15, paddingVertical: 18, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}
    >
      <View style={{ width: 26, alignItems: "center" }}>
        <AuroraIcon name={icon} size={19} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: bold ? F.black : F.bold, fontSize: fs.note, color: C.chalk, letterSpacing: -0.1 }}>{title}</Text>
        {!!meta && <View style={{ marginTop: 4 }}><MetaLine text={meta} textStyle={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }} /></View>}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {premium && (
          <View style={{ borderWidth: 1, borderColor: withAlpha(pa.fill, 0.33), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: pa.text }}>{t("train.premium")}</Text>
          </View>
        )}
        {right}
      </View>
    </PressScale>
  );
}

function Chevron({ C }: { C: Palette }) {
  return <Text style={{ fontFamily: F.reg, fontSize: 18, color: C.ash, opacity: 0.7 }}>›</Text>;
}
