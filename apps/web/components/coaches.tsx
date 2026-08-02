"use client";

import { useEffect, useState } from "react";
import type {
  CoachCard,
  CoachesResponse,
  CoachStorefrontResponse,
  CoachProfileResponse,
  CoachProgramsResponse,
  CoachProgramData,
  CoachEnrollmentsResponse,
  StorefrontProgram,
  StorefrontReview,
  ProgramPreviewWeek,
  ProgramPreviewDay,
  ProgramPreviewItem,
  EnrollmentRow,
  MutationResult,
} from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, Btn, Pill, Stars, VerifiedTick, EmptyState, ScreenHead, jget, jsend, useBusy } from "./social-ui";
import { useDialog } from "../lib/use-dialog";
import { useLang } from "@/lib/i18n";

// ---------------- Coach detail (storefront a client sees) ----------------
function CoachDetail({ handle, onClose }: { handle: string; onClose: () => void }) {
  const { t } = useLang();
  const [data, setData] = useState<CoachStorefrontResponse | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const busy = useBusy();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const load = () => jget<CoachStorefrontResponse>(`/api/coaches/${handle}`).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);

  const enroll = (programId: string) => busy.run(programId, async () => {
    const r = await jsend<MutationResult>("/api/coaches/enroll", "POST", { programId });
    if (r.error) alert(r.error);
    await load();
  });
  const submitReview = () => busy.run("rev", async () => {
    const r = await jsend<MutationResult>(`/api/coaches/${handle}/reviews`, "POST", { rating, body });
    if (r.error) { alert(r.error); return; }
    setReviewOpen(false); setBody("");
    await load();
  });

  const c = data?.coach;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", height: "100%", background: C("ink"), borderLeft: `1px solid ${C("line")}`, padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="pressable" aria-label={t("common.close")} onClick={onClose} style={{ background: "none", border: "none", color: C("ash"), fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {!data || !c ? <EmptyState title={t("common.loading")} /> : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={64} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: C("chalk") }}>{c.name || `@${c.handle}`}</span>
                  {c.coachVerified && <VerifiedTick />}
                </div>
                <div style={{ color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 13 }}>@{c.handle}</div>
                <div style={{ marginTop: 4 }}><Stars rating={data.rating} /></div>
              </div>
            </div>
            {c.headline && <div style={{ color: C("lime"), fontWeight: 600, marginTop: 12 }}>{c.headline}</div>}
            {c.bio && <p style={{ color: C("chalk"), fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{c.bio}</p>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {c.specialties?.map((s: string) => <span key={s} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}` }}>{s}</span>)}
            </div>
            {c.priceNote && <div style={{ color: C("ash"), fontSize: 13, marginTop: 10 }}>💳 {c.priceNote}</div>}
            {data.isMyCoach && <div style={{ marginTop: 10, color: C("lime"), fontSize: 13 }}>✓ {t("w.coaches.isYourCoach")}</div>}

            {/* Programs */}
            <div style={{ marginTop: 22, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>{t("w.coaches.onlinePrograms")}</div>
            {data.programs.length === 0 ? (
              <div style={{ color: C("ash"), fontSize: 13, marginTop: 8 }}>{t("w.coaches.noPublished")}</div>
            ) : data.programs.map((p: StorefrontProgram) => (
              <div key={p.id} style={{ ...card(true, { marginTop: 10, padding: 14 }) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 700 }}>{p.name}</div>
                    <div style={{ color: C("ash"), fontSize: 12 }}>{[p.goal, p.level, p.weeks ? `${p.weeks} ${t("w.coaches.weeks")}` : null].filter(Boolean).join(" – ")}</div>
                  </div>
                  {p.enrollmentStatus ? (
                    <span style={{ fontSize: 12, color: p.enrollmentStatus === "active" ? C("lime") : C("ash"), fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{p.enrollmentStatus === "active" ? `${t("w.coaches.enrolled")} ✓` : t("w.social.requested")}</span>
                  ) : data.isMe ? null : (
                    <Btn small onClick={() => enroll(p.id)} disabled={busy.is(p.id)}>{t("w.coaches.startProgram")}</Btn>
                  )}
                </div>
                {p.summary && <p style={{ color: C("chalk"), fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{p.summary}</p>}
                {Array.isArray(p.preview) && p.preview.length > 0 && (
                  <>
                    <button className="pressable" onClick={() => setPreview(preview === p.id ? null : p.id)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C("lime"), fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 700, padding: 0 }}>
                      {preview === p.id ? `${t("w.coaches.hidePreview")} ▲` : `${t("w.coaches.previewPlan")} ▼`}
                    </button>
                    {preview === p.id && (
                      <div style={{ marginTop: 8 }}>
                        {p.preview.map((w: ProgramPreviewWeek, wi: number) => (
                          <div key={wi} style={{ marginBottom: 8 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C("ash") }}>{t("w.coaches.week")} {wi + 1}</div>
                            {w.days.map((d: ProgramPreviewDay, di: number) => (
                              <div key={di} style={{ marginTop: 4 }}>
                                <div style={{ color: C("chalk"), fontSize: 13, fontWeight: 600 }}>{d.day || `${t("w.coaches.day")} ${di + 1}`}</div>
                                <div style={{ color: C("ash"), fontSize: 12 }}>{d.items.map((it: ProgramPreviewItem) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" – ") || "—"}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Reviews */}
            <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>{t("w.coaches.reviews")} ({data.reviews.length})</span>
              {data.isMyCoach && !data.isMe && <Btn ghost small onClick={() => setReviewOpen((o) => !o)}>{reviewOpen ? t("common.cancel") : t("w.coaches.writeReview")}</Btn>}
            </div>
            {reviewOpen && (
              <div style={card(true, { marginTop: 10, padding: 14 })}>
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map((n) => <button className="pressable" key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: n <= rating ? C("gold") : C("line") }}>★</button>)}
                </div>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("w.coaches.reviewPlaceholder")} style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 12, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 13 }} />
                <div style={{ marginTop: 8 }}><Btn small onClick={submitReview} disabled={busy.is("rev")}>{t("w.coaches.submitReview")}</Btn></div>
              </div>
            )}
            {data.reviews.map((rv: StorefrontReview) => (
              <div key={rv.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar url={rv.author?.avatarUrl} name={rv.author?.displayName} handle={rv.author?.handle} size={26} />
                  <span style={{ color: C("chalk"), fontWeight: 600, fontSize: 13 }}>{rv.author?.displayName || `@${rv.author?.handle}`}</span>
                  <span style={{ color: C("gold"), fontSize: 12 }}>{"★".repeat(rv.rating)}</span>
                </div>
                {rv.body && <p style={{ color: C("ash"), fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>{rv.body}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

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

  if (!data) return <EmptyState title={t("common.loading")} />;
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
export default function Coaches() {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("w.coaches.search")} style={{ width: "100%", padding: "12px 14px", borderRadius: aurora ? 16 : 10, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 16 }} />
          {!coaches ? <EmptyState title={t("common.loading")} /> : coaches.length === 0 ? (
            <EmptyState title={t("w.coaches.none")} sub={t("w.coaches.noneSub")} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {coaches.map((c) => (
                <button className="pressable" key={c.userId} onClick={() => setDetail(c.handle)} style={{ ...card(aurora), textAlign: "left", cursor: "pointer" }}>
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
        </>
      )}
      {detail && <CoachDetail handle={detail} onClose={() => { setDetail(null); load(); }} />}
    </div>
  );
}
