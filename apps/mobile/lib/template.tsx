import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_TEMPLATE, resolveTemplate, TEMPLATE_STORAGE_KEY, type TemplateName } from "@hybrid/core";

/**
 * Active UI template (see @hybrid/core templates.ts). A per-device preference —
 * mirrors the ThemeProvider pattern — selecting which screen layout each route
 * renders (classic HYBRID vs the rounded "aurora" look). Defaults to `classic`
 * so existing users are untouched until they switch it in Settings.
 */
const KEY = TEMPLATE_STORAGE_KEY;

interface TemplateCtx {
  template: TemplateName;
  setTemplate: (t: TemplateName) => void;
}

const Ctx = createContext<TemplateCtx>({
  template: DEFAULT_TEMPLATE,
  setTemplate: () => {},
});

export function TemplateProvider({ children }: { children: ReactNode }) {
  const [template, setTemplateState] = useState<TemplateName>(DEFAULT_TEMPLATE);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v != null) setTemplateState(resolveTemplate(v));
      })
      .catch((err) => console.error("Failed to load template from AsyncStorage:", err));
  }, []);

  const setTemplate = (t: TemplateName) => {
    setTemplateState(t);
    AsyncStorage.setItem(KEY, t).catch(() => {});
  };

  return <Ctx.Provider value={{ template, setTemplate }}>{children}</Ctx.Provider>;
}

export const useTemplate = () => useContext(Ctx);
