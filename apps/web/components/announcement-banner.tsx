"use client";

import { useEffect, useState } from "react";
import { LIME, AMBER, CHALK, ASH, disp, mono } from "@/lib/ui";

type Announcement = {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning";
  pinned: boolean;
  createdAt: string;
};

const DISMISS_KEY = "hybrid.announce.dismissed";
const ACCENT: Record<Announcement["level"], string> = { info: LIME, success: LIME, warning: AMBER };

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// In-app surface for admin-authored announcements. Shows pinned, in-window,
// audience-matched announcements (the API does the filtering); each is
// dismissible per-device. Renders nothing when there's nothing to say.
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => setItems((d.announcements ?? []).filter((a: Announcement) => a.pinned)))
      .catch(() => setItems([]));
  }, []);

  function dismiss(id: string) {
    const next = [...new Set([...readDismissed(), id])];
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      {visible.map((a) => {
        const accent = ACCENT[a.level];
        return (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              background: `${accent}12`,
              border: `1px solid ${accent}40`,
            }}
          >
            <span style={{ color: accent, fontSize: 16, lineHeight: 1.4 }}>
              {a.level === "warning" ? "▲" : "✦"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 15, color: CHALK }}>{a.title}</div>
              <div style={{ ...mono, fontSize: 13, lineHeight: 1.5, color: ASH, marginTop: 3, whiteSpace: "pre-wrap" }}>
                {a.body}
              </div>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              aria-label="Dismiss"
              style={{ background: "transparent", border: "none", color: ASH, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
