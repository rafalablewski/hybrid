import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeTWithOverrides, type Lang, type TranslationOverrides } from "@hybrid/core";
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
