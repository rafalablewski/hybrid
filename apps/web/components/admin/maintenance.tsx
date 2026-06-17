"use client";

import { useState } from "react";
import { LINE, CHALK, ASH, AMBER, RED, disp, mono, Mono, Card, txt } from "@/lib/ui";

// Governance → Maintenance. The home for IRREVERSIBLE, platform-wide data ops
// that don't belong to a single user — kept together behind type-to-confirm so
// they can't be triggered by accident. Each calls an admin-only, audited route.
export default function AdminMaintenance() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block" }} c={CHALK}>
        Destructive, platform-wide operations. Each is permanent, cannot be undone, and is recorded in
        the audit log. Type the confirm word to arm the button.
      </Mono>

      <DangerCard
        title="Delete ALL training sessions"
        body="Permanently removes every logged training session for every user — their full history. Accounts, plans and check-ins are kept. Use for clearing seed/demo data."
        confirmWord="DELETE SESSIONS"
        button="Delete all sessions"
        run={async () => {
          const res = await fetch("/api/admin/sessions?confirm=ALL", { method: "DELETE" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? `Failed (HTTP ${res.status})`);
          return `Deleted ${j.deleted ?? 0} session(s) across all users.`;
        }}
      />

      <DangerCard
        title="Clear the audit log"
        body="Permanently removes every entry in the admin audit trail. A single fresh entry recording this clear (you, now, and how many were removed) is written afterwards."
        confirmWord="CLEAR AUDIT"
        button="Clear audit log"
        run={async () => {
          const res = await fetch("/api/admin/audit?confirm=ALL", { method: "DELETE" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? `Failed (HTTP ${res.status})`);
          return `Cleared ${j.deleted ?? 0} audit entr${j.deleted === 1 ? "y" : "ies"}.`;
        }}
      />
    </div>
  );
}

function DangerCard({
  title,
  body,
  confirmWord,
  button,
  run,
}: {
  title: string;
  body: string;
  confirmWord: string;
  button: string;
  run: () => Promise<string>;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const armed = confirm.trim().toUpperCase() === confirmWord;

  const go = async () => {
    if (!armed) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await run();
      setMsg({ ok: true, text });
      setConfirm("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderLeft: `3px solid ${RED}` }}>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={RED}>
        Danger zone
      </Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginBottom: 14 }} c={ASH}>
        {body}
      </Mono>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={`Type "${confirmWord}" to confirm`}
          style={{ ...mono, fontSize: 13, flex: 1, minWidth: 220, padding: "10px 14px", borderRadius: 10, background: "#0a0b0a", color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <button
          onClick={go}
          disabled={!armed || busy}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: 14,
            color: txt(armed ? RED : ASH),
            background: armed ? `${RED}14` : "transparent",
            border: `1px solid ${armed ? `${RED}66` : LINE}`,
            borderRadius: 10,
            padding: "11px 20px",
            cursor: armed && !busy ? "pointer" : "default",
            opacity: busy ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Working…" : button}
        </button>
      </div>
      {msg && (
        <Mono s={{ fontSize: 12, display: "block", marginTop: 12 }} c={msg.ok ? AMBER : RED}>
          {msg.text}
        </Mono>
      )}
    </Card>
  );
}
