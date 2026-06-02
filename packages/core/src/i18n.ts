/**
 * i18n — PL / EN / DE. t(key) resolves to the active language, falling back to
 * English, then the key itself. Shared by both clients. Screen strings are
 * translated incrementally; navigation + common labels are covered here.
 */
export type Lang = "en" | "pl" | "de";

export const LANGS: Record<Lang, string> = { en: "English", pl: "Polski", de: "Deutsch" };

export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.log": "Log session",
    "nav.analytics": "Analytics",
    "nav.periodize": "Periodize",
    "nav.plans": "Plans",
    "nav.sport": "Sport",
    "nav.history": "History",
    "nav.coach": "Coach",
    "nav.roles": "Roles & access",
    "nav.capabilities": "Capabilities",
    "common.signout": "Sign out",
    "common.back": "Back",
    "scope.client": "Client",
    "scope.coach": "Coach",
    "scope.admin": "Admin",
    "home.ready": "Ready to\ntrain.",
    "home.aiCoach": "AI Coach",
    "home.startSession": "Start session →",
    "home.readiness": "readiness",
    "home.signedInAs": "Signed in as",
    "plans.chooseGoal": "Start with your goal.",
    "sport.intro": "The strength & conditioning that transfers to your sport.",
    "history.none": "No sessions yet",
    "lang.label": "Language",
  },
  pl: {
    "nav.dashboard": "Pulpit",
    "nav.log": "Zapisz sesję",
    "nav.analytics": "Analizy",
    "nav.periodize": "Periodyzacja",
    "nav.plans": "Plany",
    "nav.sport": "Sport",
    "nav.history": "Historia",
    "nav.coach": "Trener",
    "nav.roles": "Role i dostęp",
    "nav.capabilities": "Funkcje",
    "common.signout": "Wyloguj",
    "common.back": "Wstecz",
    "scope.client": "Zawodnik",
    "scope.coach": "Trener",
    "scope.admin": "Admin",
    "home.ready": "Gotowy do\ntreningu.",
    "home.aiCoach": "Trener AI",
    "home.startSession": "Zacznij sesję →",
    "home.readiness": "gotowość",
    "home.signedInAs": "Zalogowano jako",
    "plans.chooseGoal": "Zacznij od swojego celu.",
    "sport.intro": "Trening siły i kondycji dopasowany do Twojego sportu.",
    "history.none": "Brak sesji",
    "lang.label": "Język",
  },
  de: {
    "nav.dashboard": "Übersicht",
    "nav.log": "Einheit",
    "nav.analytics": "Analysen",
    "nav.periodize": "Periodisierung",
    "nav.plans": "Pläne",
    "nav.sport": "Sport",
    "nav.history": "Verlauf",
    "nav.coach": "Coach",
    "nav.roles": "Rollen & Zugriff",
    "nav.capabilities": "Funktionen",
    "common.signout": "Abmelden",
    "common.back": "Zurück",
    "scope.client": "Athlet",
    "scope.coach": "Coach",
    "scope.admin": "Admin",
    "home.ready": "Bereit zum\nTraining.",
    "home.aiCoach": "KI-Coach",
    "home.startSession": "Einheit starten →",
    "home.readiness": "Bereitschaft",
    "home.signedInAs": "Angemeldet als",
    "plans.chooseGoal": "Beginne mit deinem Ziel.",
    "sport.intro": "Kraft & Ausdauer, die zu deinem Sport passt.",
    "history.none": "Noch keine Einheiten",
    "lang.label": "Sprache",
  },
};

export function makeT(lang: Lang): (key: string) => string {
  return (key: string) =>
    TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}
