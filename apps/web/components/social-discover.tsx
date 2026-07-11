"use client";

import { useEffect, useState } from "react";
import type { PersonCard, SearchResponse, SuggestionsResponse } from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, FollowButton, VerifiedTick, EmptyState, ScreenHead, jget, jsend, useBusy } from "./social-ui";
import { ProfileDrawer } from "./social-profile";

// NOTE: userId is OPTIONAL — /api/social/search returns it, but /api/social/
// suggestions returns `id` (no userId), so suggested rows currently key + follow
// on undefined. Kept honest here (was a required-string lie); see the audit.
type Person = PersonCard;

function Row({ p, onChanged, onOpen }: { p: Person; onChanged: () => void; onOpen: (h: string) => void }) {
  const busy = useBusy();
  const follow = () => busy.run("f", async () => { await jsend("/api/social/follow", "POST", { followeeId: p.userId }); onChanged(); });
  const unfollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "DELETE", { followeeId: p.userId }); onChanged(); });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
      <button onClick={() => onOpen(p.handle)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textAlign: "left", padding: 0 }}>
        <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={42} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            {p.displayName || `@${p.handle}`}{p.coachVerified && <VerifiedTick />}
          </div>
          <div style={{ color: C("ash"), fontSize: 12, fontFamily: "var(--font-mono)" }}>@{p.handle}{p.reason ? ` · ${p.reason}` : p.isCoach ? " · coach" : ""}</div>
        </div>
      </button>
      <FollowButton relation={p.relation ?? "none"} onFollow={follow} onUnfollow={unfollow} busy={busy.is("f")} />
    </div>
  );
}

export default function SocialDiscover() {
  const { aurora } = useSocialTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [sugg, setSugg] = useState<Person[]>([]);
  const [drawer, setDrawer] = useState<string | null>(null);

  const loadSugg = () => jget<SuggestionsResponse>("/api/social/suggestions").then((r) => setSugg(r.suggestions ?? []));
  useEffect(() => { loadSugg(); }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const id = setTimeout(() => { jget<SearchResponse>(`/api/social/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results ?? [])); }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const refresh = () => { if (q.trim().length >= 2) jget<SearchResponse>(`/api/social/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results ?? [])); loadSugg(); };

  return (
    <div style={{ maxWidth: 600 }}>
      <ScreenHead title="Find friends" sub="Search by @handle or name. Follow to compare and cheer." />
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people…"
        style={{ width: "100%", padding: "12px 14px", borderRadius: aurora ? 16 : 10, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 16 }}
      />

      {results !== null ? (
        <div style={card(aurora)}>
          {results.length === 0 ? <EmptyState title="No one found" sub="Try a different name or handle." /> : results.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={setDrawer} />)}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C("ash"), textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>People you may know</div>
          <div style={card(aurora)}>
            {sugg.length === 0 ? <EmptyState title="No suggestions yet" sub="Once you train with a coach or follow a few people, we'll suggest others here." /> : sugg.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={setDrawer} />)}
          </div>
        </>
      )}
      {drawer && <ProfileDrawer handle={drawer} onClose={() => { setDrawer(null); refresh(); }} />}
    </div>
  );
}
