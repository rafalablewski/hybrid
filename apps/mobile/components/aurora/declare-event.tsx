import { useState } from "react";
import { Text, View } from "react-native";
import {
  DISCIPLINE_META, EVENT_LABEL_MAX, TRAINING_KINDS, fs, leading, space, tracking,
  type DeclaredEvent, type TrainingKind,
} from "@hybrid/core";
import { createDayEvent } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F, ty } from "../../lib/ui";
import { AChip, AField, APill } from "./kit";
import { Glyph, SportMark } from "./icons";

/**
 * DECLARE A RACE — the half of "what's on tomorrow" no log can answer.
 *
 * The day band protects the day before something that matters, and it can work
 * half of that out on its own: `weeklyFixture()` finds a kind landing on the
 * same weekday in at least three of the last six weeks, which is exactly what a
 * Thursday five-a-side is. A half marathon in six weeks leaves no trace in the
 * log until the day it happens, so nothing will ever detect it. This is where
 * the athlete says so.
 *
 * THREE FIELDS AND NO FOURTH: a date (the day this is mounted against, so the
 * sheet never asks for something the calendar already knows), a discipline, and
 * an optional name. There is no time, no distance, no goal — every one of those
 * would be a thing to fill in that changes nothing about what the band says,
 * and the band is the only consumer this has.
 *
 * WHY THE NAME IS OPTIONAL AND SHORT: it is dropped straight into the band's
 * 26pt headline, under a 44-character budget the copy tests hold across three
 * languages. `EVENT_LABEL_MAX` is what is left of that budget once the longest
 * locale's wrapper is subtracted — an unnamed event falls back to its own
 * discipline's noun ("You have a game tomorrow"), which is already useful.
 */

/** The discipline's own drawing, resolved through the endurance hub's
 *  `DISCIPLINE_META` so the mark on the chip, the mark on the band and the mark
 *  on that sport's lane are one object. */
function KindMark({ kind, color }: { kind: TrainingKind; color: string }) {
  if (kind === "gym") return <Glyph name="barbell" size={14} color={color} />;
  const mark = DISCIPLINE_META[kind]?.mark;
  if (!mark) return null;
  return mark.kind === "sport"
    ? <SportMark sport={mark.sport} size={14} color={color} />
    : <Glyph name={mark.name} size={14} color={color} />;
}

export default function DeclareEvent({
  date,
  onSaved,
}: {
  /** The local day key (yyyy-mm-dd) this event lands on. */
  date: string;
  onSaved: (event: DeclaredEvent) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [kind, setKind] = useState<TrainingKind | null>(null);
  const [label, setLabel] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    if (!kind || state === "saving") return;
    setState("saving");
    try {
      const event = await createDayEvent({ date, kind, label: label.trim() || null });
      setState("saved");
      // A null comes back only from a server that accepted the write and
      // returned something the sanitizer refused — treat it as the error it is
      // rather than closing on a row nobody can see.
      if (event) onSaved(event);
      else setState("error");
    } catch {
      // The write is NOT soft (lib/api.ts): there is no client-side cache
      // standing behind it, so an event that silently went nowhere would be the
      // app losing the one thing it ever asked the athlete for.
      setState("error");
    }
  };

  return (
    <View style={{ marginTop: space.lg }}>
      {/* `overline`, not `kicker`: these two are SECTION labels — the sheet's
          structure — and the wider caps tracking is what says so. */}
      <Text style={{ ...ty(C, "overline"), marginBottom: space.md }}>
        {t("w.event.kindHead")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {TRAINING_KINDS.map((k) => (
          <View key={k} style={{ flexDirection: "row" }}>
            <AChip
              label={t(`w.home.band.noun.${k}`)}
              selected={kind === k}
              onPress={() => setKind(kind === k ? null : k)}
            />
          </View>
        ))}
      </View>

      {/* The chosen discipline's mark, beside the name it is about to carry —
          the same drawing the band will put at the head of the day, so what is
          being declared is visible before it is saved rather than after. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xl, marginBottom: space.md }}>
        {kind ? <KindMark kind={kind} color={C.ash} /> : null}
        <Text style={ty(C, "overline")}>{t("w.event.nameHead")}</Text>
      </View>
      <AField
        value={label}
        onChange={(v) => setLabel(v.slice(0, EVENT_LABEL_MAX))}
        placeholder={t("w.event.namePlaceholder")}
        onClear={label ? () => setLabel("") : undefined}
        onSubmit={save}
        returnKey="done"
      />
      <Text
        style={{
          fontFamily: F.reg,
          fontSize: fs.caption,
          lineHeight: leading(fs.caption),
          color: C.ash,
          marginBottom: space.lg,
        }}
      >
        {t("w.event.nameNote")}
      </Text>

      <APill
        label={t("w.event.save")}
        onPress={save}
        disabled={!kind}
        state={state}
        savingLabel={t("w.event.saving")}
        savedLabel={t("w.event.saved")}
      />
      {state === "error" ? (
        <Text
          style={{
            fontFamily: F.reg,
            fontSize: fs.caption,
            lineHeight: leading(fs.caption),
            color: C.accentText.red,
            marginTop: space.md,
          }}
        >
          {t("w.event.failed")}
        </Text>
      ) : null}
    </View>
  );
}
