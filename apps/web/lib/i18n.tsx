"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { makeTWithOverrides, localeDirection, type Lang, type TranslationOverrides } from "@hybrid/core";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangCtx = createContext<Ctx | null>(null);
const KEY = "hybrid.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  // Admin localization overrides, layered over the shipped strings (empty until
  // loaded / when none exist, so the app always renders on the baseline first).
  const [overrides, setOverrides] = useState<TranslationOverrides | undefined>(undefined);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved === "en" || saved === "pl" || saved === "de") setLangState(saved);
    fetch("/api/translations")
      .then((r) => r.json())
      .then((d) => setOverrides(d.overrides ?? undefined))
      .catch(() => setOverrides(undefined));
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // ignore
    }
  };

  // Keep the document's language + direction in sync with the active locale.
  // The server renders <html lang="en"> statically, so a PL/DE user previously
  // had content mislabelled as English (screen readers pick the wrong voice /
  // pronunciation rules). `dir` is routed through localeDirection so an RTL
  // locale would flip the whole document from here (all shipped locales = ltr).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = localeDirection(lang);
  }, [lang]);

  const t = useMemo(() => makeTWithOverrides(lang, overrides), [lang, overrides]);

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
