"use client";

import { useState } from "react";
import { LINE, LIME, CHALK, ASH, cond } from "@/lib/ui";
import CapabilitiesScreen from "../capabilities";
import DataNet from "../datanet";

type Tab = "capabilities" | "datanet";

export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("capabilities");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
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
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              padding: "8px 16px",
              borderRadius: 9,
              cursor: "pointer",
              border: `1px solid ${tab === id ? LIME : LINE}`,
              background: tab === id ? LIME : "transparent",
              color: tab === id ? "#0c0d0c" : ASH,
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
