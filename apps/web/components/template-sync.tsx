"use client";

import { useEffect } from "react";
import { useTemplate } from "@/lib/use-template";

/**
 * Mirrors the active UI template onto <html data-template> so global CSS in
 * globals.css ([data-template="aurora"] …) can soften every app-shell screen
 * to the Aurora look. Renders null.
 */
export default function TemplateSync() {
  const { template } = useTemplate();
  useEffect(() => {
    document.documentElement.dataset.template = template;
  }, [template]);
  return null;
}
