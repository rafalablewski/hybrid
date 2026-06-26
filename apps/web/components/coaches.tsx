"use client";

import { useEffect, useState } from "react";
import { C, useSocialTheme, card, Avatar, Btn, Pill, Stars, VerifiedTick, EmptyState, ScreenHead, jget, jsend, useBusy } from "./social-ui";

interface CoachCard {
  userId: string; handle: string; name: string | null; avatarUrl: string | null;
  headline: string | null; specialties: string[]; sports: string[]; acceptingClients: boolean;
  priceNote: string | null; coachVerified: boolean; programs: number; rating: number | null; reviews: number;
}

// ---------------- Coach detail (storefront a client sees) ----------------
function CoachDetail({ handle, onClose }: { handle: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const busy = useBusy();

  const load = () => jget(`/api/coaches/${handle}`).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);

  const enroll = (programId: string) => busy.run(programId, async () => {
    const r: any = await jsend("/api/coaches/enroll", "POST", { programId });
    if (r.error) alert(r.error);
    await load();
  });
  const submitReview = () => busy.run("rev", async () => {
    const r: any = await jsend(`/api/coaches/${handle}/reviews`, "POST", { rating, body });
    if (r.error) { alert(r.error); return; }
    setReviewOpen(false); setBody("");
    await load();
  });

  const c = data?.coach;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", height: "100%", background: C("ink"), borderLeft: `1px solid ${C("line")}`, padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: C("ash"), fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {!c ? <EmptyState title="Loading…" /> : (
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
            {data.isMyCoach && <div style={{ marginTop: 10, color: C("lime"), fontSize: 13 }}>✓ This is your coach.</div>}

            {/* Programs */}
            <div style={{ marginTop: 22, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>Online programs</div>
            {data.programs.length === 0 ? (
              <div style={{ color: C("ash"), fontSize: 13, marginTop: 8 }}>No published programs yet.</div>
            ) : data.programs.map((p: any) => (
              <div key={p.id} style={{ ...card(true, { marginTop: 10, padding: 14 }) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 700 }}>{p.name}</div>
                    <div style={{ color: C("ash"), fontSize: 12 }}>{[p.goal, p.level, p.weeks ? `${p.weeks} weeks` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  {p.enrollmentStatus ? (
                    <span style={{ fontSize: 12, color: p.enrollmentStatus === "active" ? C("lime") : C("amber"), fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{p.enrollmentStatus === "active" ? "Enrolled ✓" : "Requested"}</span>
                  ) : data.isMe ? null : (
                    <Btn small onClick={() => enroll(p.id)} disabled={busy.is(p.id)}>Start program</Btn>
                  )}
                </div>
                {p.summary && <p style={{ color: C("chalk"), fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{p.summary}</p>}
                {Array.isArray(p.preview) && p.preview.length > 0 && (
                  <>
                    <button onClick={() => setPreview(preview === p.id ? null : p.id)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C("lime"), fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 700, padding: 0 }}>
                      {preview === p.id ? "Hide preview ▲" : "Preview the plan ▼"}
                    </button>
                    {preview === p.id && (
                      <div style={{ marginTop: 8 }}>
                        {p.preview.map((w: any, wi: number) => (
                          <div key={wi} style={{ marginBottom: 8 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C("ash") }}>Week {wi + 1}</div>
                            {w.days.map((d: any, di: number) => (
                              <div key={di} style={{ marginTop: 4 }}>
                                <div style={{ color: C("chalk"), fontSize: 12.5, fontWeight: 600 }}>{d.day || `Day ${di + 1}`}</div>
                                <div style={{ color: C("ash"), fontSize: 12 }}>{d.items.map((it: any) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" · ") || "—"}</div>
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
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>Reviews ({data.reviews.length})</span>
              {data.isMyCoach && !data.isMe && <Btn ghost small onClick={() => setReviewOpen((o) => !o)}>{reviewOpen ? "Cancel" : "Write a review"}</Btn>}
            </div>
            {reviewOpen && (
              <div style={card(true, { marginTop: 10, padding: 14 })}>
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: n <= rating ? C("amber") : C("line") }}>★</button>)}
                </div>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="How was the coaching?" style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 12, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 13 }} />
                <div style={{ marginTop: 8 }}><Btn small onClick={submitReview} disabled={busy.is("rev")}>Submit review</Btn></div>
              </div>
            )}
            {data.reviews.map((rv: any) => (
              <div key={rv.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar url={rv.author?.avatarUrl} name={rv.author?.displayName} handle={rv.author?.handle} size={26} />
                  <span style={{ color: C("chalk"), fontWeight: 600, fontSize: 13 }}>{rv.author?.displayName || `@${rv.author?.handle}`}</span>
                  <span style={{ color: C("amber"), fontSize: 12 }}>{"★".repeat(rv.rating)}</span>
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
  const { aurora } = useSocialTheme();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({ headline: "", bio: "", specialties: "", sports: "", acceptingClients: true, autoAccept: false, priceNote: "", visibility: "public" });
  const [programs, setPrograms] = useState<any[]>([]);
  const [enroll, setEnroll] = useState<any>({ incoming: [], mine: [] });
  const [saved, setSaved] = useState(false);
  const busy = useBusy();

  const load = async () => {
    const d: any = await jget("/api/coach/profile");
    setData(d);
    if (d.profile) setForm({ headline: d.profile.headline ?? "", bio: d.profile.bio ?? "", specialties: (d.profile.specialties ?? []).join(", "), sports: (d.profile.sports ?? []).join(", "), acceptingClients: d.profile.acceptingClients, autoAccept: d.profile.autoAccept, priceNote: d.profile.priceNote ?? "", visibility: d.profile.visibility });
    const pr: any = await jget("/api/coach/programs"); setPrograms(pr.programs ?? []);
    setEnroll(await jget("/api/coach/enrollments"));
  };
  useEffect(() => { load(); }, []);

  const save = () => busy.run("save", async () => {
    const r: any = await jsend("/api/coach/profile", "PUT", { ...form, specialties: form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean), sports: form.sports.split(",").map((s: string) => s.trim()).filter(Boolean) });
    if (r.error) { alert(r.error); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    await load();
  });
  const togglePublish = (p: any) => busy.run(p.id, async () => { await jsend(`/api/coach/programs/${p.id}`, "PATCH", { published: !p.published }); await load(); });
  const respond = (id: string, action: string) => busy.run(id, async () => { await jsend("/api/coach/enrollments", "POST", { enrollmentId: id, action }); await load(); });

  if (!data) return <EmptyState title="Loading…" />;
  if (!data.isCoach) return <EmptyState title="Coaches only" sub="Apply to become a coach to publish programs and appear in the marketplace." />;

  const inp = { width: "100%", padding: "10px 12px", borderRadius: aurora ? 14 : 8, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 14 } as const;
  const fld = (label: string, node: React.ReactNode) => <label style={{ display: "block", marginBottom: 12 }}><span style={{ display: "block", fontSize: 12, color: C("ash"), marginBottom: 4 }}>{label}</span>{node}</label>;

  return (
    <div style={{ maxWidth: 600 }}>
      {!data.handle && <div style={{ ...card(aurora, { marginBottom: 16, borderColor: C("amber") }) }}>⚠ Claim a @handle on <strong>My profile</strong> first — the marketplace lists you by handle.</div>}
      <div style={card(aurora)}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 12 }}>Your storefront</div>
        {fld("Headline", <input style={inp} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Olympic weightlifting coach · 10y" />)}
        {fld("Bio", <textarea style={{ ...inp, minHeight: 80 }} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />)}
        {fld("Specialties (comma-separated)", <input style={inp} value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder="Strength, Olympic lifting" />)}
        {fld("Sports (comma-separated)", <input style={inp} value={form.sports} onChange={(e) => setForm({ ...form, sports: e.target.value })} placeholder="Weightlifting, CrossFit" />)}
        {fld("Pricing note", <input style={inp} value={form.priceNote} onChange={(e) => setForm({ ...form, priceNote: e.target.value })} placeholder="Free for now · paid plans coming" />)}
        <div style={{ display: "flex", gap: 16, margin: "4px 0 12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: C("chalk"), fontSize: 13 }}><input type="checkbox" checked={form.acceptingClients} onChange={(e) => setForm({ ...form, acceptingClients: e.target.checked })} /> Accepting clients</label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: C("chalk"), fontSize: 13 }}><input type="checkbox" checked={form.autoAccept} onChange={(e) => setForm({ ...form, autoAccept: e.target.checked })} /> Auto-accept enrolments</label>
        </div>
        <Btn onClick={save} disabled={busy.is("save")}>{saved ? "Saved ✓" : busy.is("save") ? "Saving…" : "Save storefront"}</Btn>
      </div>

      {/* Programs publish */}
      <div style={{ marginTop: 24, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 8 }}>Programs ({programs.length})</div>
      <div style={card(aurora)}>
        {programs.length === 0 ? <EmptyState title="No programs yet" sub="Build a multi-week program in the Coach console, then publish it here." /> : programs.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
            <div><div style={{ color: C("chalk"), fontWeight: 600 }}>{p.name}</div><div style={{ color: C("ash"), fontSize: 12 }}>{p.goal ?? "—"}</div></div>
            <Btn small ghost={!p.published} tone="lime" onClick={() => togglePublish(p)} disabled={busy.is(p.id)}>{p.published ? "Published ✓" : "Publish"}</Btn>
          </div>
        ))}
      </div>

      {/* Enrolment requests */}
      {enroll.incoming?.length > 0 && (
        <>
          <div style={{ marginTop: 24, fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk"), marginBottom: 8 }}>Enrolment requests</div>
          <div style={card(aurora)}>
            {enroll.incoming.map((e: any) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C("line")}` }}>
                <Avatar url={e.client?.avatarUrl} name={e.client?.displayName} handle={e.client?.handle} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C("chalk"), fontWeight: 600 }}>{e.client?.displayName || `@${e.client?.handle}`}</div>
                  <div style={{ color: C("ash"), fontSize: 12 }}>{e.programName} · <span style={{ color: e.status === "active" ? C("lime") : C("amber") }}>{e.status}</span></div>
                </div>
                {e.status === "requested" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => respond(e.id, "accept")} disabled={busy.is(e.id)}>Accept</Btn>
                    <Btn small ghost onClick={() => respond(e.id, "decline")} disabled={busy.is(e.id)}>Decline</Btn>
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
  const { aurora } = useSocialTheme();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  const load = () => jget(`/api/coaches${q.trim() ? `?q=${encodeURIComponent(q)}` : ""}`).then((r: any) => setCoaches(r.coaches ?? []));
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { jget("/api/coach/profile").then((d: any) => setIsCoach(!!d.isCoach)); }, []);

  return (
    <div style={{ maxWidth: 640 }}>
      <ScreenHead title="Coaches" sub="Find a coach and start an online program." right={isCoach ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Pill active={tab === "browse"} onClick={() => setTab("browse")}>Browse</Pill>
          <Pill active={tab === "storefront"} onClick={() => setTab("storefront")}>My coaching</Pill>
        </div>
      ) : undefined} />

      {tab === "storefront" && isCoach ? (
        <Storefront />
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coaches, sports, specialties…" style={{ width: "100%", padding: "12px 14px", borderRadius: aurora ? 16 : 10, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 16 }} />
          {!coaches ? <EmptyState title="Loading…" /> : coaches.length === 0 ? (
            <EmptyState title="No coaches yet" sub="When coaches publish their storefronts they'll appear here." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {coaches.map((c) => (
                <button key={c.userId} onClick={() => setDetail(c.handle)} style={{ ...card(aurora), textAlign: "left", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={52} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: C("chalk") }}>{c.name || `@${c.handle}`}</span>
                        {c.coachVerified && <VerifiedTick />}
                        {!c.acceptingClients && <span style={{ fontSize: 11, color: C("ash") }}>· full</span>}
                      </div>
                      <div style={{ color: C("ash"), fontSize: 13 }}>{c.headline || c.specialties.join(" · ") || `@${c.handle}`}</div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: C("ash"), fontFamily: "var(--font-mono)" }}>
                        <span>{c.programs} program{c.programs === 1 ? "" : "s"}</span>
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
