"use client";

import Link from "next/link";
import { brand, CORE_VERSION, type AuroraIconName } from "@hybrid/core";
import { space, GlassField } from "@/lib/ui";
import { useTemplate } from "@/lib/use-template";
import { AuroraIcon } from "@/components/aurora/icons";

const FEATURES = [
  { t: "Every conditioning format, natively", d: "EMOM, AMRAP, intervals, for-time, steady-state — modeled properly, not crammed into a sets-and-reps box.", c: "var(--color-blue)" },
  { t: "Strength + engine, one dashboard", d: "Watch your squat climb and your 2k drop on the same screen. Nobody else shows this.", c: "var(--color-lime)" },
  { t: "An AI coach that programs both", d: "Auto-regulated sessions from your real performance. Human coaching when you want a person in the loop.", c: "var(--color-violet)" },
];

export default function Landing() {
  const { template } = useTemplate();
  return template === "aurora" ? <AuroraLanding /> : <ClassicLanding />;
}

function ClassicLanding() {
  return (
    <>
      <GlassField />
      <main className="relative z-10 mx-auto min-h-screen w-full max-w-5xl px-6 pb-24">
        <header className="flex items-center justify-between py-6">
          <div className="font-display text-2xl font-black tracking-tight">{brand.name}<span className="text-lime">.</span></div>
          <Link href="/login" className="liquid-glass lg-hover inline-flex items-center px-4 py-2 font-display text-sm font-bold text-chalk"><span className="lg-sheen" />Sign in</Link>
        </header>
        <section className="pt-12 sm:pt-20">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">Strength · Conditioning</span>
          <h1 className="mt-5 font-display text-6xl font-black leading-[0.95] tracking-tight sm:text-8xl">Train like<br /><span className="text-lime">two athletes.</span></h1>
          <p className="mt-6 max-w-xl font-display text-lg text-ash">The only log built for athletes who lift heavy <i>and</i> condition. One app for the barbell and the engine — with an AI coach that programs both.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/login" className="rounded-xl bg-lime px-7 py-3.5 font-display font-extrabold text-ink transition hover:opacity-90">Start training →</Link></div>
        </section>
        <section className="mt-20">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">The gap</span>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Your tracker can&apos;t see half your training.</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="liquid-glass lg-hover p-5" style={{ borderLeft: `3px solid ${f.c}` }}><span className="lg-sheen" /><div className="font-display text-lg font-bold">{f.t}</div><p className="mt-2 font-display text-sm leading-relaxed text-ash">{f.d}</p></div>
            ))}
          </div>
        </section>
        <footer className="mt-20 flex items-center gap-2 border-t border-line pt-8"><span className="h-2 w-2 rounded-full bg-lime" /><span className="font-mono text-xs text-ash">{brand.web} · @hybrid/core {CORE_VERSION}</span></footer>
      </main>
    </>
  );
}

/** AURORA landing — the promotional marketing homepage (rounded Aurora look,
 *  uploaded icon set). Leads with the product story + CTAs; sign-in is demoted
 *  to the header so the homepage sells the app instead of reading as a login. */
function AuroraLanding() {
  const features: { icon: AuroraIconName; t: string; d: string; c: string }[] = [
    { icon: "play", t: "Every format, natively", d: "EMOM, AMRAP, intervals, for-time, steady-state — modeled properly, not crammed into a sets-and-reps box.", c: "var(--color-blue)" },
    { icon: "arrow-up", t: "Strength + engine, one view", d: "Watch your squat climb and your 2k drop on the same screen. Nobody else shows both.", c: "var(--color-lime)" },
    { icon: "heart", t: "An AI coach for both", d: "Auto-regulated sessions from your real performance — human coaching when you want a person in the loop.", c: "var(--color-violet)" },
    { icon: "check-circle", t: "Readiness-aware", d: "Recovery and load steer every prescription, so each day's work matches what your body can actually take.", c: "var(--color-lime)" },
    { icon: "calendar-event", t: "Periodized seasons", d: "Real macrocycles — phases, deloads and peaks — that reconcile your lifting and conditioning into one week.", c: "var(--color-blue)" },
    { icon: "location", t: "Track the engine", d: "Runs, rows and intervals logged with pace and distance — the cardio half your strength tracker ignores.", c: "var(--color-violet)" },
  ];
  const formats = ["EMOM", "AMRAP", "Intervals", "For-time", "Steady-state", "5×5", "Tempo", "VO₂"];
  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <GlassField />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-24">
        <header className="flex items-center justify-between py-6">
          <div className="font-display text-2xl font-black tracking-tight">{brand.name}<span className="text-lime">.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
            <Link href="/login" className="font-display text-sm font-bold text-ash" style={{ padding: "10px 6px" }}>Sign in</Link>
            <Link href="/login?mode=signup" style={pillLight}>Start free</Link>
          </div>
        </header>

        {/* HERO — lead with the product story, not the auth buttons */}
        <section className="pt-12 sm:pt-20">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">Strength · Conditioning</span>
          <h1 className="mt-5 font-display text-5xl font-black leading-[0.98] tracking-tight sm:text-7xl">
            Train like<br /><span className="text-lime">two athletes.</span>
          </h1>
          <p className="mt-6 max-w-xl font-display text-lg leading-relaxed text-ash">
            The only log built for athletes who lift heavy <i>and</i> condition. One app for the barbell and the engine — with an AI coach that programs both around your real readiness.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login?mode=signup" style={pillLight}>Start training →</Link>
            <Link href="/login" style={pillSoft}>I already have an account</Link>
          </div>
          {/* format strip — concrete proof we model conditioning natively */}
          <div className="mt-10 flex flex-wrap gap-2">
            {formats.map((f) => (
              <span key={f} className="font-mono text-xs uppercase tracking-wide text-ash" style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)", borderRadius: 999, padding: "6px 12px" }}>{f}</span>
            ))}
          </div>
        </section>

        {/* THE GAP — the problem we solve */}
        <section className="mt-20">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">The gap</span>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Your tracker can&apos;t see half your training.
          </h2>
          <p className="mt-3 max-w-xl font-display text-base leading-relaxed text-ash">
            Strength apps ignore your conditioning. Running apps ignore your lifting. HYBRID is built for both at once.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)", borderRadius: 26, padding: 22 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(199,239,0,.12)", display: "grid", placeItems: "center" }}>
                  <AuroraIcon name={f.icon} size={24} color={f.c} />
                </div>
                <div className="mt-4 font-display text-base font-bold">{f.t}</div>
                <p className="mt-1.5 font-display text-sm leading-relaxed text-ash">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA — single, confident */}
        <section className="mt-20">
          <div style={{ position: "relative", overflow: "hidden", background: "var(--color-ink2)", border: "1px solid var(--color-line)", borderRadius: 30, padding: "40px 28px", textAlign: "center" }}>
            <span style={{ position: "absolute", top: -70, right: -50, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(199,239,0,.18),transparent 70%)", pointerEvents: "none" }} />
            <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">Start your hybrid season.</h2>
            <p className="mx-auto mt-3 max-w-md font-display text-base text-ash">Free to start. Your strength and your engine, finally on one dashboard.</p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <Link href="/login?mode=signup" style={{ ...pillLight, width: "100%", maxWidth: 320 }}>Create your account</Link>
              <Link href="/login" style={{ ...pillSoft, width: "100%", maxWidth: 320 }}>Sign in</Link>
            </div>
          </div>
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lime" />
            <span className="font-mono text-xs text-ash">{brand.web} · @hybrid/core {CORE_VERSION}</span>
          </div>
          <div className="flex gap-4 font-display text-sm font-bold text-ash">
            <Link href="/timer" className="underline">Interval timer</Link>
            <Link href="/statistics" className="underline">Statistics</Link>
            <Link href="/notifications" className="underline">Activity</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

const pillLight = { borderRadius: 999, background: "var(--color-chalk)", color: "var(--color-ink)", padding: "16px 28px", fontWeight: 700, fontFamily: "var(--font-display)", textAlign: "center" as const, display: "inline-block" };
const pillSoft = { borderRadius: 999, background: "var(--color-ink2)", color: "var(--color-chalk)", border: "1px solid var(--color-line)", padding: "12px 22px", fontWeight: 700, fontFamily: "var(--font-display)", textAlign: "center" as const, display: "inline-block" };
