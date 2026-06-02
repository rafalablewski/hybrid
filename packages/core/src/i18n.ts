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
    "scope.client": "Client",
    "scope.coach": "Coach",
    "scope.admin": "Admin",
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
    "scope.client": "Zawodnik",
    "scope.coach": "Trener",
    "scope.admin": "Admin",
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
    "scope.client": "Athlet",
    "scope.coach": "Coach",
    "scope.admin": "Admin",
  },
};

export function makeT(lang: Lang): (key: string) => string {
  return (key: string) =>
    TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}
