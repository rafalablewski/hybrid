import {
  fmtKm,
  fmtTonnage,
  disciplinePaceFigure,
  formatDisciplinePace,
  fmtWeight,
  formatDuration,
  durationUnits,
  paceClock,
  pluralForm,
  sliceName,
  type Lang,
  type WeekLine,
  type WeekSportRead,
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
      case "sports":
        return fill(line.key, { list: sportList(line.sports, t, u) });
      case "records":
        return fill(line.key, { n: records(line.count), r: recordPhrase(line.top, t, units) });
      case "verdict":
        return fill(line.key, { m: line.metricKey ? t(line.metricKey) : "" });
    }
  });
}

/**
 * EVERY SPORT, NAMED — "8.2 km of running at 5:22 /km and 1h 15min of tennis".
 *
 * The list is joined in words rather than with a comma throughout, because the
 * paragraph is prose: an Oxford-less "a, b and c" is what a person says, and
 * the conjunction is a translated word for the same reason the sentences are.
 * (Intl.ListFormat would do this too, and is not reliably present on the
 * JS engine this ships on.)
 */
function sportList(sports: WeekSportRead[], t: (key: string) => string, u: { h: string; min: string }): string {
  const parts = sports.map((sp) =>
    t(sp.key)
      .split("{k}").join(fmtKm(sp.distanceKm))
      .split("{h}").join(formatDuration(sp.minutes, u))
      .split("{s}").join(sliceName(sp.slice, t).toLowerCase())
      // THE DISCIPLINE'S OWN READING, not "/km" for everything: a swim is
      // quoted per 100 m and a ride as a speed, which is how each is spoken
      // and how every other rate in the app is already printed.
      .split("{p}").join(rate(sp, sp.paceSecPerKm))
      // THE BEST GOES IN BARE, no unit — it sits in a parenthesis directly
      // after the average, which has just stated the unit both are in.
      .split("{b}").join(figure(sp, sp.bestPaceSecPerKm)),
  );
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${t("recap.narr.and")} ${parts[parts.length - 1]}`;
}

/** A rate in the discipline's own convention — "5:22 /km", "1:48 /100m",
 *  "32.5 km/h" — or nothing at all where there is no rate to state. */
const rate = (sp: WeekSportRead, secPerKm: number | null): string =>
  secPerKm == null ? "" : sp.slice.discipline ? formatDisciplinePace(secPerKm, sp.slice.discipline) : `${paceClock(secPerKm)} /km`;

/** The same rate with the unit left off. */
const figure = (sp: WeekSportRead, secPerKm: number | null): string =>
  secPerKm == null ? "" : sp.slice.discipline ? disciplinePaceFigure(secPerKm, sp.slice.discipline) : paceClock(secPerKm);

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
