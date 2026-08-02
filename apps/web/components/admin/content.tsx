"use client";

import { useState } from "react";
import { fs, space, LINE, LIME, CHALK, ASH, ON_ACCENT, cond } from "@/lib/ui";
import CapabilitiesScreen from "../capabilities";
import DataNet from "../datanet";

type Tab = "capabilities" | "datanet";

export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("capabilities");

  return (
    <div>
      <div style={{ display: "flex", gap: space.sm, marginBottom: 20 }}>
        {(
          [
            ["capabilities", "Capabilities"],
            ["datanet", "Data network"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...cond,
              fontSize: fs.bodyLg,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              padding: "10px 16px",
              borderRadius: "var(--r-field)",
              cursor: "pointer",
              border: `1px solid ${tab === id ? LIME : LINE}`,
              background: tab === id ? LIME : "transparent",
              color: tab === id ? ON_ACCENT : ASH,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "capabilities" && <CapabilitiesScreen />}
      {tab === "datanet" && <DataNet />}
    </div>
  );
}
