"use client";

import { useEffect, useState } from "react";
import type { PersonCard, SearchResponse, SuggestionsResponse } from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, FollowButton, VerifiedTick, EmptyState, ScreenHead, jget, jsend, useBusy, type OpenUser } from "./social-ui";
import { useLang } from "@/lib/i18n";
import { armPerson } from "@/lib/shared-element";

// Both /api/social/search and /api/social/suggestions return a real userId
// (the row keys + follows on it), so this shape is shared across both sources.
type Person = PersonCard;

function Row({ p, onChanged, onOpen }: { p: Person; onChanged: () => void; onOpen: OpenUser }) {
  const { t } = useLang();
  const busy = useBusy();
  const follow = () => busy.run("f", async () => { await jsend("/api/social/follow", "POST", { followeeId: p.userId }); onChanged(); });
  const unfollow = () => busy.run("f", async () => { await jsend("/api/social/follow", "DELETE", { followeeId: p.userId }); onChanged(); });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
      <button className="pressable" onClick={() => onOpen(p.handle, p)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textAlign: "left", padding: 0 }}>
        <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={42} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            {p.displayName || `@${p.handle}`}{p.coachVerified && <VerifiedTick />}
          </div>
          <div style={{ color: C("ash"), fontSize: 12, fontFamily: "var(--font-mono)" }}>@{p.handle}{p.reason ? ` – ${p.reason}` : p.isCoach ? ` – ${t("w.social.reasonCoach")}` : ""}</div>
        </div>
      </button>
      <FollowButton relation={p.relation ?? "none"} onFollow={follow} onUnfollow={unfollow} busy={busy.is("f")} />
    </div>
  );
}

export default function SocialDiscover({ onOpenUser }: { onOpenUser?: OpenUser }) {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [sugg, setSugg] = useState<Person[]>([]);

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
      <ScreenHead title={t("w.social.findFriends")} sub={t("w.social.findFriendsSub")} />
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("w.social.searchPeople")}
        style={{ width: "100%", padding: "12px 14px", borderRadius: aurora ? 16 : 10, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 16 }}
      />

      {results !== null ? (
        <div style={card(aurora)}>
          {results.length === 0 ? <EmptyState title={t("w.social.noOneFound")} sub={t("w.social.noOneFoundSub")} /> : results.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={(h, c) => { armPerson(h); onOpenUser?.(h, c); }} />)}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C("ash"), textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{t("w.social.peopleYouMayKnow")}</div>
          <div style={card(aurora)}>
            {sugg.length === 0 ? <EmptyState title={t("w.social.noSuggestions")} sub={t("w.social.noSuggestionsSub")} /> : sugg.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={(h, c) => { armPerson(h); onOpenUser?.(h, c); }} />)}
          </div>
        </>
      )}
    </div>
  );
}
