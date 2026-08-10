"use client";

import { accentText } from "@/lib/ui";
import { useEffect, useState } from "react";
import type {
  CoachCard,
  CoachesResponse,
  CoachProfileResponse,
  CoachProgramsResponse,
  CoachProgramData,
  CoachEnrollmentsResponse,
  EnrollmentRow,
  MutationResult,
} from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, Btn, Pill, Stars, VerifiedTick, EmptyState, ScreenHead, jget, jsend, useBusy, type OpenUser } from "./social-ui";
import { useLang } from "@/lib/i18n";
import { Loading, LoadSwap } from "./aurora/skeleton";
import { armPerson } from "@/lib/shared-element";
import { useListFilter } from "@/lib/list-motion";

/**
 * THE MARKETPLACE — the directory, and a coach's own storefront EDITOR.
 *
 * Reading a coach is not here: tapping one opens their PAGE
 * (components/user-page.tsx), where coaching is a tab on the person rather than
 * a separate storefront drawer. A coach is one human with more to offer, not a
 * second kind of profile.
 */

// ---------------- Coach's own storefront editor ----------------
function Storefront() {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [data, setData] = useState<CoachProfileResponse | null>(null);
  const [form, setForm] = useState({ headline: "", bio: "", specialties: "", sports: "", acceptingClients: true, autoAccept: false, priceNote: "", visibility: "public" });
  const [programs, setPrograms] = useState<CoachProgramData[]>([]);
  const [enroll, setEnroll] = useState<CoachEnrollmentsResponse>({ incoming: [], mine: [] });
  const [saved, setSaved] = useState(false);
  const busy = useBusy();

  const load = async () => {
    const d = await jget<CoachProfileResponse>("/api/coach/profile");
    setData(d);
    if (d.profile) setForm({ headline: d.profile.headline ?? "", bio: d.profile.bio ?? "", specialties: (d.profile.specialties ?? []).join(", "), sports: (d.profile.sports ?? []).join(", "), acceptingClients: d.profile.acceptingClients, autoAccept: d.profile.autoAccept, priceNote: d.profile.priceNote ?? "", visibility: d.profile.visibility });
    const pr = await jget<CoachProgramsResponse>("/api/coach/programs"); setPrograms(pr.programs ?? []);
    setEnroll(await jget<CoachEnrollmentsResponse>("/api/coach/enrollments"));
  };
  useEffect(() => { load(); }, []);

  const save = () => busy.run("save", async () => {
    const r = await jsend<MutationResult>("/api/coach/profile", "PUT", { ...form, specialties: form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean), sports: form.sports.split(",").map((s: string) => s.trim()).filter(Boolean) });
    if (r.error) { alert(r.error); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    await load();
  });
  const togglePublish = (p: CoachProgramData) => busy.run(p.id, async () => { await jsend(`/api/coach/programs/${p.id}`, "PATCH", { published: !p.published }); await load(); });
  const respond = (id: string, action: string) => busy.run(id, async () => { await jsend("/api/coach/enrollments", "POST", { enrollmentId: id, action }); await load(); });

  if (!data) return <Loading />;
  if (!data.isCoach) return <EmptyState title={t("w.coaches.coachesOnly")} sub={t("w.coaches.coachesOnlySub")} />;

  const inp = { width: "100%", padding: "10px 12px", borderRadius: aurora ? 14 : 8, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 14 } as const;
  const fld = (label: string, node: React.ReactNode) => <label style={{ display: "block", marginBottom: 12 }}><span style={{ display: "block", fontSize: 12, color: C("ash"), marginBottom: 4 }}>{label}</span>{node}</label>;

  return (
    <div style={{ maxWidth: 600 }}>
      {!data.handle && <div style={{ ...card(aurora, { marginBottom: 16, borderColor: C("amber") }) }}>⚠ {t("w.coaches.claimHandle")}</div>}
      <div style={card(aurora)}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 12 }}>{t("w.coaches.yourStorefront")}</div>
        {fld(t("w.coaches.headline"), <input style={inp} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={t("w.coaches.headlinePlaceholder")} />)}
        {fld(t("w.coaches.bio"), <textarea style={{ ...inp, minHeight: 80 }} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />)}
        {fld(t("w.coaches.specialties"), <input style={inp} value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder={t("w.coaches.specialtiesPlaceholder")} />)}
        {fld(t("w.coaches.sports"), <input style={inp} value={form.sports} onChange={(e) => setForm({ ...form, sports: e.target.value })} placeholder={t("w.coaches.sportsPlaceholder")} />)}
        {fld(t("w.coaches.pricingNote"), <input style={inp} value={form.priceNote} onChange={(e) => setForm({ ...form, priceNote: e.target.value })} placeholder={t("w.coaches.pricingPlaceholder")} />)}
        <div style={{ display: "flex", gap: 16, margin: "4px 0 12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: C("chalk"), fontSize: 13 }}><input type="checkbox" checked={form.acceptingClients} onChange={(e) => setForm({ ...form, acceptingClients: e.target.checked })} /> {t("w.coaches.acceptingClients")}</label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: C("chalk"), fontSize: 13 }}><input type="checkbox" checked={form.autoAccept} onChange={(e) => setForm({ ...form, autoAccept: e.target.checked })} /> {t("w.coaches.autoAccept")}</label>
        </div>
        <Btn onClick={save} disabled={busy.is("save")}>{saved ? `${t("w.coaches.saved")} ✓` : busy.is("save") ? t("w.coaches.saving") : t("w.coaches.saveStorefront")}</Btn>
      </div>

      {/* Programs publish */}
      <div style={{ marginTop: 24, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 8 }}>{t("w.coaches.programsCount")} ({programs.length})</div>
      <div style={card(aurora)}>
        {programs.length === 0 ? <EmptyState title={t("w.coaches.noPrograms")} sub={t("w.coaches.noProgramsSub")} /> : programs.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
            <div><div style={{ color: C("chalk"), fontWeight: 600 }}>{p.name}</div><div style={{ color: C("ash"), fontSize: 12 }}>{p.goal ?? "—"}</div></div>
            <Btn small ghost={!p.published} tone="lime" onClick={() => togglePublish(p)} disabled={busy.is(p.id)}>{p.published ? `${t("w.coaches.published")} ✓` : t("w.coaches.publish")}</Btn>
          </div>
        ))}
      </div>

      {/* Enrolment requests */}
      {enroll.incoming?.length > 0 && (
        <>
          <div style={{ marginTop: 24, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 8 }}>{t("w.coaches.enrolmentRequests")}</div>
          <div style={card(aurora)}>
            {enroll.incoming.map((e: EnrollmentRow) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
                <Avatar url={e.client?.avatarUrl} name={e.client?.displayName} handle={e.client?.handle} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C("chalk"), fontWeight: 600 }}>{e.client?.displayName || `@${e.client?.handle}`}</div>
                  <div style={{ color: C("ash"), fontSize: 12 }}>{e.programName} – <span style={{ color: e.status === "active" ? C("lime") : C("ash") }}>{e.status}</span></div>
                </div>
                {e.status === "requested" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => respond(e.id, "accept")} disabled={busy.is(e.id)}>{t("w.coaches.accept")}</Btn>
                    <Btn small ghost onClick={() => respond(e.id, "decline")} disabled={busy.is(e.id)}>{t("w.coaches.decline")}</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Marketplace directory ----------------
export default function Coaches({ onOpenUser }: { onOpenUser?: OpenUser } = {}) {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  // Survivors of a filter MOVE; only genuine arrivals fade in.
  const [listRef, refilter] = useListFilter();
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  const load = () => jget<CoachesResponse>(`/api/coaches${q.trim() ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => setCoaches(r.coaches ?? []));
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { jget<CoachProfileResponse>("/api/coach/profile").then((d) => setIsCoach(!!d.isCoach)); }, []);

  return (
    <div style={{ maxWidth: 640 }}>
      <ScreenHead title={t("w.coaches.title")} sub={t("w.coaches.sub")} right={isCoach ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Pill active={tab === "browse"} onClick={() => setTab("browse")}>{t("w.coaches.browse")}</Pill>
          <Pill active={tab === "storefront"} onClick={() => setTab("storefront")}>{t("w.coaches.myCoaching")}</Pill>
        </div>
      ) : undefined} />

      {tab === "storefront" && isCoach ? (
        <Storefront />
      ) : (
        <>
          <input value={q} onChange={(e) => refilter(() => setQ(e.target.value))} placeholder={t("w.coaches.search")} style={{ width: "100%", padding: "12px 14px", borderRadius: aurora ? 16 : 10, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 16 }} />
          {/* The placeholder HANDS OVER to the coaches — it fades out where they
              fade in, rather than an empty-state card being replaced by a full
              list in one frame (aurora/skeleton.tsx LoadSwap). */}
          <LoadSwap loading={!coaches}>
          {coaches?.length === 0 ? (
            <EmptyState title={t("w.coaches.none")} sub={t("w.coaches.noneSub")} />
          ) : (
            <div ref={listRef} style={{ display: "grid", gap: 12 }}>
              {coaches?.map((c) => (
                <button
                  data-list-row
                  className="pressable"
                  key={c.userId}
                  // THE FACE TRAVELS. A row's avatar and the portrait heading
                  // the page it opens are literally the same image of the same
                  // person, so it grows from 52px to 84px instead of being
                  // re-rendered there with no thread back to what was touched.
                  onClick={() => {
                    armPerson(c.handle);
                    onOpenUser?.(c.handle, { handle: c.handle, displayName: c.name, avatarUrl: c.avatarUrl, coachVerified: c.coachVerified });
                  }}
                  style={{ ...card(aurora), textAlign: "left", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={52} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>{c.name || `@${c.handle}`}</span>
                        {c.coachVerified && <VerifiedTick />}
                        {!c.acceptingClients && <span style={{ fontSize: 11, color: C("ash") }}>– {t("w.coaches.full")}</span>}
                      </div>
                      <div style={{ color: C("ash"), fontSize: 13 }}>{c.headline || c.specialties.join(" – ") || `@${c.handle}`}</div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: C("ash"), fontFamily: "var(--font-mono)" }}>
                        <span>{c.programs} {c.programs === 1 ? t("w.coaches.program") : t("w.coaches.programsWord")}</span>
                        <Stars rating={c.rating} size={12} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          </LoadSwap>
        </>
      )}
    </div>
  );
}
