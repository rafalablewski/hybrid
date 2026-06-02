import { brand, CORE_VERSION } from "@hybrid/core";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-lime">
        {brand.web}
      </span>

      <h1 className="mt-4 font-display text-7xl font-black tracking-tight text-chalk sm:text-8xl">
        {brand.name}
        <span className="text-lime">.</span>
      </h1>

      <p className="mt-4 max-w-md font-display text-base text-ash">
        {brand.tagline}
      </p>

      <div className="mt-10 flex items-center gap-2 rounded-full border border-line bg-ink2 px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-lime" />
        <span className="font-mono text-xs text-ash">
          web client · @hybrid/core {CORE_VERSION}
        </span>
      </div>
    </main>
  );
}
