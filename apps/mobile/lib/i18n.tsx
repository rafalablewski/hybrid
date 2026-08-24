import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeTWithOverrides, pluralForm, type Lang, type TranslationOverrides } from "@hybrid/core";
import { fetchTranslationOverrides } from "./api";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangCtx = createContext<Ctx | null>(null);
const KEY = "hybrid.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  // Admin localization overrides layered over the shipped strings (empty until
  // loaded / when none exist, so the baseline always renders first).
  const [overrides, setOverrides] = useState<TranslationOverrides | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "en" || v === "pl" || v === "de") setLangState(v);
    });
    fetchTranslationOverrides().then(setOverrides).catch(() => setOverrides(undefined));
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  };

  const t = useMemo(() => makeTWithOverrides(lang, overrides), [lang, overrides]);

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}

/**
 * "3 sessions" / "1 session" — the session COUNT, in the reader's language and
 * in the right plural form.
 *
 * A count is not a number with a label stuck on the end of it. English has two
 * forms, Polish has three, and a screen that concatenates `${n} ${t("sessions")}`
 * says "1 sessions" in the first and picks the wrong ending three times in the
 * second. The Records board already carried the strings and did this correctly
 * for its own fold line; History's hero, its week chapters and the week summary
 * each concatenated instead. One helper, so the next surface that counts
 * sessions inherits the plurals rather than the bug.
 */
export function useSessionCount(): (n: number) => string {
  const { t, lang } = useLang();
  return (n: number) => t(`w.home.rb.sessN.${pluralForm(n, lang)}`).replace("{n}", String(n));
}
