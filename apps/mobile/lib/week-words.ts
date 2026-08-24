import {
  fmtKm,
  fmtTonnage,
  fmtWeight,
  formatDuration,
  durationUnits,
  paceClock,
  pluralForm,
  sliceName,
  type Lang,
  type WeekLine,
  type WeekTopRecord,
  type WeightUnit,
} from "@hybrid/core";

/**
 * THE WEEK'S PARAGRAPH, RESOLVED — core's sentence keys and canonical numbers
 * turned into this reader's language, units and spelling of a duration.
 *
 * It lives on the client because every substitution is a client concern: the
 * athlete's weight unit, their h/min words, and the plural rules of their
 * language. Core hands over the shape and the arithmetic and stays out of all
 * three (see week-narrative.ts).
 *
 * ONE RESOLVER, TWO SURFACES. The summary screen reads the week out under its
 * figures and the 9:16 story card carries the same paragraph out of the app.
 * A card that paraphrased the screen would be the app describing one week two
 * ways to two audiences.
 */
export function weekWords(
  lines: WeekLine[],
  t: (key: string) => string,
  lang: Lang,
  units: WeightUnit,
): string[] {
  const u = durationUnits(t);
  /** "4 sessions" / "1 session", in this language's plural form. */
  const sessions = (n: number) => t(`w.home.rb.sessN.${pluralForm(n, lang)}`).replace("{n}", String(n));
  /** "3 days" / "1 day" — the sentence carries "active" in its own preposition
   *  ("across 3 days"), so repeating it here read as "across 3 active days". */
  const days = (n: number) => t(`recap.dayN.${pluralForm(n, lang)}`).replace("{n}", String(n));
  const lifts = (n: number) => `${n} ${t(n === 1 ? "histview.liftLbl" : "histview.liftsLbl")}`;
  const records = (n: number) => `${n} ${t(n === 1 ? "recap.record" : "recap.prs")}`;

  const fill = (key: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), t(key));

  return lines.map((line) => {
    switch (line.kind) {
      case "shape":
        return fill(line.key, {
          n: sessions(line.sessions),
          d: days(line.days),
          g: String(line.gymEfforts),
          e: String(line.endEfforts),
        });
      case "gym":
        return fill(line.key, {
          t: fmtTonnage(line.tonnageKg, units),
          s: String(line.sets),
          l: lifts(line.lifts),
        });
      case "ground":
        return fill(line.key, {
          k: fmtKm(line.distanceKm),
          h: formatDuration(line.minutes, u),
          s: line.lead ? sliceName(line.lead, t).toLowerCase() : "",
          p: line.paceSecPerKm != null ? `${paceClock(line.paceSecPerKm)} /km` : "",
        });
      case "records":
        return fill(line.key, { n: records(line.count), r: recordPhrase(line.top, t, units) });
      case "verdict":
        return fill(line.key, { m: line.metricKey ? t(line.metricKey) : "" });
    }
  });
}

/** "Bench Press at 102.5 kg" — the record, named, with the figure it stands at. */
function recordPhrase(top: WeekTopRecord, t: (key: string) => string, units: WeightUnit): string {
  const value =
    top.kind === "strength"
      ? fmtWeight(top.loadKg, units)
      : top.kind === "distance"
        ? fmtKm(top.km)
        : `${paceClock(top.secPerKm)} /km`;
  return t("recap.narr.recordAt").split("{name}").join(top.name).split("{value}").join(value);
}
