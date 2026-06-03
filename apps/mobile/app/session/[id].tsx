import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  sessionVolume,
  blockBestE1rm,
  prsForSession,
  type LoggedSession,
  type PrHit,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { WorkoutShareCard, shareWorkout, type ShareBest } from "../../lib/share";
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Loading, C, F } from "../../lib/ui";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function SessionDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardRef = useRef<View>(null);
  const [all, setAll] = useState<LoggedSession[] | null>(null);

  useEffect(() => {
    fetchSessions().then(setAll);
  }, []);

  if (all === null) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const session = all.find((s) => s.id === id);
  if (!session) {
    return (
      <Screen>
        <Back router={router} t={t} />
        <Card style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
          <Mono>{t("session.notFound")}</Mono>
        </Card>
      </Screen>
    );
  }

  const prs = prsForSession(all, session.id);
  const prSet = new Set(prs.map((p) => p.lift));
  const strength = session.blocks.filter((b) => b.kind === "strength");
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const minutes =
    session.completedAt
      ? Math.max(1, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
      : null;

  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b));
      if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
    }
  const bests: ShareBest[] = [...bestMap.entries()]
    .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
    .sort((a, b) => b.e1rm - a.e1rm);

  const shareText = [
    `\u{1F4AA} ${session.title || "Workout"} — ${t("share.done")}`,
    `${minutes ? `${minutes} min · ` : ""}${sets} ${t("summary.sets").toLowerCase()} · ${sessionVolume(session.blocks).toLocaleString()} kg`,
    prs[0] ? `\u{1F3C6} ${prLine(prs[0], t)}` : bests[0] ? `${t("share.topLift")}: ${bests[0].name} ${bests[0].e1rm}kg` : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Screen>
      <Back router={router} t={t} />

      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 10 }}>{session.title}</Text>
      <Mono style={{ marginTop: 4 }}>
        {fmtDate(session.startedAt)} · {fmtTime(session.startedAt)}
        {session.readiness != null ? ` · ${t("home.readiness")} ${session.readiness}` : ""}
      </Mono>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Metric label={t("summary.minutes")} value={minutes != null ? String(minutes) : "—"} />
        <Metric label={t("summary.sets")} value={String(sets)} />
        <Metric label={t("summary.kgMoved")} value={sessionVolume(session.blocks).toLocaleString()} />
      </View>

      {prs.length > 0 && (
        <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: C.lime, borderRadius: 16, padding: 16, marginTop: 16 }}>
          <Text style={{ fontFamily: F.black, fontSize: 15, color: C.lime }}>🏆 {prs.length} {t("summary.newPrs")}</Text>
          {prs.slice(0, 6).map((p) => (
            <Text key={p.lift} style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk, marginTop: 6 }}>{prLine(p, t)}</Text>
          ))}
        </View>
      )}

      {/* Per-exercise breakdown */}
      <View style={{ marginTop: 16 }}>
        {session.blocks.map((b, i) => (
          <Card key={i}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: b.kind === "strength" ? C.lime : C.blue }}>{b.kind.toUpperCase()}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk }}>
                  {prSet.has(b.name) ? "🏆 " : ""}{b.name}
                </Text>
              </View>
              {b.kind === "strength" && blockBestE1rm(b) > 0 && (
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.lime }}>
                  {Math.round(blockBestE1rm(b))} kg e1RM
                </Text>
              )}
            </View>

            {b.kind === "strength" ? (
              <View style={{ marginTop: 8 }}>
                {b.sets.map((s, j) => (
                  <View key={j} style={{ flexDirection: "row", gap: 12, paddingVertical: 4, borderTopWidth: j ? 1 : 0, borderTopColor: C.line }}>
                    <Mono color={C.ash} style={{ width: 22 }}>{j + 1}</Mono>
                    <Mono color={C.chalk} style={{ flex: 1 }}>{s.load || "–"} kg × {s.reps || "–"}</Mono>
                    {s.rpe ? <Mono color={C.ash}>RPE {s.rpe}</Mono> : null}
                    {s.vel ? <Mono color={C.blue}>{s.vel} m/s</Mono> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Mono style={{ marginTop: 8 }}>
                {[b.format, b.minutes ? `${b.minutes} min` : null, b.rpe ? `RPE ${b.rpe}` : null].filter(Boolean).join(" · ")}
              </Mono>
            )}
          </Card>
        ))}
      </View>

      {/* Shareable card — relive (and re-share) an old win */}
      {strength.length > 0 && (
        <>
          <View style={{ marginTop: 6 }}>
            <WorkoutShareCard ref={cardRef} t={t} stats={{ title: session.title, minutes: minutes ?? 0, sets, volume: sessionVolume(session.blocks), bests }} />
          </View>
          <Pressable
            onPress={() => shareWorkout(cardRef, shareText, t("summary.share"))}
            style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 14 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{t("summary.share")}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const prLine = (p: PrHit, t: (k: string) => string) =>
  p.previous == null ? `${p.lift} ${p.e1rm}kg (${t("summary.firstTime")})` : `${p.lift} ${p.e1rm}kg (+${p.e1rm - p.previous})`;

function Back({ router, t }: { router: ReturnType<typeof useRouter>; t: (k: string) => string }) {
  return (
    <Pressable onPress={() => router.back()} hitSlop={10}>
      <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("nav.history")}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
