import { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { askAiCoach, type CoachNote } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ABack, RADIUS } from "./kit";

/** AURORA AI coach — same /api/ai-coach call (server-side Claude, engine
 *  fallback) and rendered note as the classic, in the rounded look.
 *
 *  `embedded` renders JUST the note body (chips + text + Ask again) with no
 *  screen chrome — used inside the Home "Ask your coach" card, which already
 *  carries its own header/description, so we don't double-wrap a whole screen
 *  (heading + back + card) inside another card. The default (full screen) is
 *  used by the standalone /ai-coach route. */
export default function AuroraAiCoach({ embedded = false }: { embedded?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [note, setNote] = useState<CoachNote | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setBusy(true);
    setNote(await askAiCoach());
    setBusy(false);
  }, []);

  // Generate today's note on open; the athlete can re-ask any time.
  useEffect(() => {
    ask();
  }, [ask]);

  const chip = (label: string, color: string) => (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, color) }}>{label}</Text>
    </View>
  );

  // The note body — shared between the embedded card and the full screen.
  const body = (
    <>
      {busy ? (
        <View style={{ marginTop: embedded ? 10 : 18, flexDirection: "row", alignItems: "center", gap: space.ms }}>
          <ActivityIndicator color={C.lime} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.home.aicoach.reading")}</Text>
        </View>
      ) : note?.text ? (
        <View style={{ marginTop: embedded ? 4 : 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 10, flexWrap: "wrap" }}>
            {note.source ? chip(note.source === "ai" ? "Claude" : t("w.home.aicoach.engine"), note.source === "ai" ? C.lime : C.ash) : null}
            {note.readiness != null ? chip(`readiness ${note.readiness}/100`, C.ash) : null}
            {note.hpi != null ? chip(`HPI ${note.hpi}`, C.ash) : null}
          </View>
          {/* Coaching PROSE in Archivo (reads like a coach talking), not mono
              (which reads like a terminal log). Mono stays for the data chips. */}
          <Text style={{ fontFamily: F.reg, fontSize: embedded ? 14 : 15.5, lineHeight: embedded ? 21 : 24, color: txt(C, C.chalk) }}>{note.text}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: embedded ? 12 : 16 }}>
        <APill label={busy ? t("w.home.aicoach.thinking") : t("w.home.aicoach.askAgain")} variant="soft" onPress={ask} disabled={busy} style={{ paddingVertical: 12 }} />
      </View>
    </>
  );

  // Embedded: no screen/header/inner-card — the Home card is the wrapper.
  if (embedded) return body;

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.home.today.aiCoach")}</AHeading>
      </View>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>{t("w.home.aicoach.todaysNote")}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 8, lineHeight: 20 }}>
          {t("w.home.aicoach.intro")}
        </Text>
        {body}
      </ACard>
    </AuroraScreen>
  );
}
