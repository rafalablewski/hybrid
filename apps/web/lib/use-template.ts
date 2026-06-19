"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TEMPLATE, resolveTemplate, TEMPLATE_STORAGE_KEY, type TemplateName } from "@hybrid/core";

const KEY = TEMPLATE_STORAGE_KEY;

/**
 * Active UI template (classic ⇄ aurora) — see @hybrid/core templates.ts. A
 * per-device preference persisted to localStorage, mirroring the mobile
 * TemplateProvider. Defaults to `aurora` (the main HYBRID look); a stored
 * preference from the Settings switcher wins. Client-only (the screens it gates
 * are client components); SSR renders the default and the client corrects on mount.
 */
export function useTemplate() {
  const [template, setTemplateState] = useState<TemplateName>(DEFAULT_TEMPLATE);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v != null) setTemplateState(resolveTemplate(v));
    } catch {
      /* ignore */
    }
  }, []);

  const setTemplate = (t: TemplateName) => {
    setTemplateState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  };

  return { template, setTemplate };
}
