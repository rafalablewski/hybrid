import Link from "next/link";
import { brand, CORE_VERSION } from "@hybrid/core";
import { GlassField } from "@/lib/ui";

const FEATURES = [
  {
    t: "Every conditioning format, natively",
    d: "EMOM, AMRAP, intervals, for-time, steady-state — modeled properly, not crammed into a sets-and-reps box.",
    c: "var(--color-blue)",
  },
  {
    t: "Strength + engine, one dashboard",
    d: "Watch your squat climb and your 2k drop on the same screen. Nobody else shows this.",
    c: "var(--color-lime)",
  },
  {
    t: "An AI coach that programs both",
    d: "Auto-regulated sessions from your real performance. Human coaching when you want a person in the loop.",
    c: "var(--color-violet)",
  },
];

export default function Landing() {
  return (
    <>
      {/* ambient field — drifting accent blobs the glass refracts */}
      <GlassField />
      <main className="relative z-10 mx-auto min-h-screen w-full max-w-5xl px-6 pb-24">
      <header className="flex items-center justify-between py-6">
        <div className="font-display text-2xl font-black tracking-tight">
          {brand.name}
          <span className="text-lime">.</span>
        </div>
        <Link
          href="/login"
          className="liquid-glass lg-hover inline-flex items-center px-4 py-2 font-display text-sm font-bold text-chalk"
        >
          <span className="lg-sheen" />
          Sign in
        </Link>
      </header>

      <section className="pt-12 sm:pt-20">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">
          Strength · Conditioning
        </span>
        <h1 className="mt-5 font-display text-6xl font-black leading-[0.95] tracking-tight sm:text-8xl">
          Train like
          <br />
          <span className="text-lime">two athletes.</span>
        </h1>
        <p className="mt-6 max-w-xl font-display text-lg text-ash">
          The only log built for athletes who lift heavy <i>and</i> condition. One app for the
          barbell and the engine — with an AI coach that programs both.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-lime px-7 py-3.5 font-display font-extrabold text-ink transition hover:opacity-90"
          >
            Start training →
          </Link>
        </div>
      </section>

      <section className="mt-20">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-lime">The gap</span>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          Your tracker can&apos;t see half your training.
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.t}
              className="liquid-glass lg-hover p-5"
              style={{ borderLeft: `3px solid ${f.c}` }}
            >
              <span className="lg-sheen" />
              <div className="font-display text-lg font-bold">{f.t}</div>
              <p className="mt-2 font-display text-sm leading-relaxed text-ash">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-20 flex items-center gap-2 border-t border-line pt-8">
        <span className="h-2 w-2 rounded-full bg-lime" />
        <span className="font-mono text-xs text-ash">
          {brand.web} · @hybrid/core {CORE_VERSION}
        </span>
      </footer>
      </main>
    </>
  );
}
