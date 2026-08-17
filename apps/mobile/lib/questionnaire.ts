import { useEffect } from "react";
import { isEmptyVolumeProfile, type AthleteVolumeProfile } from "@hybrid/core";
import { fetchQuestionnaire, saveQuestionnaire } from "./api";
import { getLoggerPrefs, setLoggerPref } from "./logger-prefs";

/**
 * THE QUESTIONNAIRE'S ACCOUNT SYNC.
 *
 * The answers themselves stay where every reader already looks for them —
 * `loggerPrefs.volumeProfile`, hydrated from AsyncStorage — because a second
 * store for the same values is how two surfaces start disagreeing. This module
 * is only the wire to the account: hydrate once, push on change.
 *
 * ── WHAT HAPPENS WHEN TWO DEVICES DISAGREE ────────────────────────────────
 *
 * THE ACCOUNT WINS, WHOLESALE, whenever it has anything at all; a device only
 * seeds it when it is empty. That is a deliberate choice over the per-field
 * merge you would reach for first, and the reason is deletion. Merging field by
 * field cannot tell "this device never knew the answer" from "this device
 * cleared the answer", so a value the athlete deleted on their phone comes back
 * from the tablet on the next hydrate — silently, into a model that then
 * explains itself with a number they thought they had removed. Wholesale has no
 * such failure: the last write to the account is the athlete's current answer,
 * and every edit writes the whole object immediately, so an account only trails
 * a device that was offline while editing.
 *
 * The seed case is the migration path. An athlete who has been answering the
 * questionnaire since before it had a server column has a full local profile and
 * an empty account; the first hydrate pushes their answers UP rather than wiping
 * them, and from then on the account is authoritative.
 *
 * Both halves soft-degrade: signed out, offline, or the column not yet migrated
 * (reference/sql-questionnaire.sql) all leave the on-device answers exactly as
 * they were. Nothing here can lose an answer by failing.
 */

let hydrated = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function hydrateFromServer(): void {
  if (hydrated) return;
  hydrated = true;
  fetchQuestionnaire()
    .then((server) => {
      const local = getLoggerPrefs().volumeProfile;
      if (isEmptyVolumeProfile(server)) {
        // The account has never been written. Seed it from this device rather
        // than clearing answers the athlete gave before the column existed.
        if (!isEmptyVolumeProfile(local)) void saveQuestionnaire(local);
        return;
      }
      if (JSON.stringify(server) === JSON.stringify(local)) return;
      setLoggerPref("volumeProfile", server);
    })
    .catch(() => {});
}

/**
 * Persist the athlete's answers: on-device immediately, to the account shortly
 * after. The local write and the re-render stay synchronous so the control the
 * athlete just touched never lags behind their thumb; the PUT coalesces ~600 ms
 * after the last edit, which is one call for a scrub across twenty values
 * instead of twenty.
 */
export function setQuestionnaire(next: AthleteVolumeProfile): void {
  setLoggerPref("volumeProfile", next);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void saveQuestionnaire(getLoggerPrefs().volumeProfile);
  }, 600);
}

/**
 * Reset on sign-out / user switch, so the next account on this device does not
 * inherit the previous athlete's body, training age and recovery — which would
 * not merely be a privacy leak but would quietly hand them someone else's
 * volume model, labelled "estimated for you".
 */
export function resetQuestionnaire(): void {
  if (pushTimer) {
    clearTimeout(pushTimer); // never let a queued push land against the new account
    pushTimer = null;
  }
  hydrated = false;
  setLoggerPref("volumeProfile", {});
  hydrateFromServer(); // called on sign-IN too — pull the arriving athlete's own answers
}

/** Pull the account's answers once, from anywhere the questionnaire is read. */
export function useQuestionnaireSync(): void {
  useEffect(() => {
    hydrateFromServer();
  }, []);
}
