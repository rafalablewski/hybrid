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

/** AURORA landing — soft, rounded marketing screen using the uploaded icon set. */
function AuroraLanding() {
  const cards: { icon: AuroraIconName; t: string; d: string; c: string }[] = [
    { icon: "play", t: "Every format, natively", d: "EMOM, AMRAP, intervals, for-time, steady-state — modeled properly.", c: "var(--color-blue)" },
    { icon: "arrow-up", t: "Strength + engine, one view", d: "Your squat climbing and your 2k dropping on the same screen.", c: "var(--color-lime)" },
    { icon: "heart", t: "An AI coach for both", d: "Auto-regulated sessions from your real performance.", c: "var(--color-violet)" },
  ];
  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <GlassField />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24">
        <header className="flex items-center justify-between py-6">
          <div className="font-display text-2xl font-black tracking-tight">{brand.name}<span className="text-lime">.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: space.ms }}>
            <Link href="/notifications" aria-label="Notifications" style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--color-ink2)", border: "1px solid var(--color-line)", display: "grid", placeItems: "center" }}>
              <AuroraIcon name="bell" size={20} color="var(--color-ash)" />
            </Link>
            <Link href="/login" style={pillSoft}>Sign in</Link>
          </div>
        </header>

        <section className="pt-14 text-center">
          <div style={{ width: 76, height: 76, borderRadius: "50%", border: "1.5px solid var(--color-line)", display: "grid", placeItems: "center", margin: "0 auto" }}>
            <span className="font-display text-3xl font-black">H<span className="text-lime">.</span></span>
          </div>
          <h1 className="mt-7 font-display text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">Start your<br /><span className="text-lime">Fitness</span> Journey</h1>
          <p className="mx-auto mt-5 max-w-md font-display text-lg text-ash">Strength &amp; conditioning for hybrid athletes — programmed from your real training.</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link href="/login?mode=signup" style={{ ...pillLight, width: "100%", maxWidth: 360 }}>Register</Link>
            <Link href="/login" style={{ ...pillSoft, width: "100%", maxWidth: 360 }}>Login</Link>
            <div className="mt-2 flex gap-4 font-display text-sm font-bold text-ash">
              <Link href="/timer" className="underline">Interval timer</Link>
              <Link href="/statistics" className="underline">Statistics</Link>
              <Link href="/notifications" className="underline">Activity</Link>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-3 sm:grid-cols-3">
          {cards.map((f) => (
            <div key={f.t} style={{ background: "var(--color-ink2)", border: "1px solid var(--color-line)", borderRadius: 26, padding: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(196,240,53,.12)", display: "grid", placeItems: "center" }}>
                <AuroraIcon name={f.icon} size={24} color={f.c} />
              </div>
              <div className="mt-3 font-display text-base font-bold">{f.t}</div>
              <p className="mt-1.5 font-display text-sm leading-relaxed text-ash">{f.d}</p>
            </div>
          ))}
        </section>
        <footer className="mt-16 flex items-center justify-center gap-2 pt-8"><span className="h-2 w-2 rounded-full bg-lime" /><span className="font-mono text-xs text-ash">{brand.web} · @hybrid/core {CORE_VERSION}</span></footer>
      </main>
    </div>
  );
}

const pillLight = { borderRadius: 999, background: "var(--color-chalk)", color: "var(--color-ink)", padding: "16px 28px", fontWeight: 700, fontFamily: "var(--font-display)", textAlign: "center" as const, display: "inline-block" };
const pillSoft = { borderRadius: 999, background: "var(--color-ink2)", color: "var(--color-chalk)", border: "1px solid var(--color-line)", padding: "12px 22px", fontWeight: 700, fontFamily: "var(--font-display)", textAlign: "center" as const, display: "inline-block" };
