// Operator guidance — plain-language runbooks surfaced in the web admin
// console (Governance → Guidance). Kept here in @hybrid/core so the content is
// the single source of truth and any client (web today, a future mobile admin)
// renders the same words. This is documentation-as-data: edit the blocks, both
// the copy and its structure update wherever it's rendered.

/** One rendered piece of a guide section. */
export type GuideBlock =
  | { t: "p"; text: string }
  | { t: "steps"; items: string[] }
  | { t: "note"; text: string }
  | { t: "term"; term: string; text: string };

export type GuideSection = {
  id: string;
  /** A glyph for the section header (kept brand-neutral / emoji-light). */
  icon: string;
  title: string;
  /** Optional one-line summary under the title. */
  summary?: string;
  blocks: GuideBlock[];
};

export type Guide = {
  id: string;
  title: string;
  /** Human "last reviewed" date so the reader knows how fresh it is. */
  updated: string;
  sections: GuideSection[];
};

/**
 * "Shipping HYBRID — web & the App Store" — answers the recurring questions
 * about Expo / EAS / Apple / hosting in beginner terms, specific to THIS repo
 * (Next.js web on Vercel; an Expo React-Native app that ships via EAS →
 * TestFlight → App Store; one shared /api; Supabase Postgres).
 */
export const DEPLOY_GUIDE: Guide = {
  id: "deploy",
  title: "Shipping HYBRID — web & the App Store",
  updated: "2026-06-16",
  sections: [
    {
      id: "big-picture",
      icon: "◆",
      title: "The big picture (read this first)",
      summary: "HYBRID is one product on two clients that ship in completely different ways.",
      blocks: [
        {
          t: "p",
          text: "HYBRID is one codebase with two front-ends: the WEB app (apps/web, a Next.js site) and the MOBILE app (apps/mobile, an Expo / React-Native app for iPhone). They share the same brain (packages/core) and call the same backend (the /api routes that live inside the web app on Vercel).",
        },
        {
          t: "p",
          text: "The two clients ship through totally different doors. WEB is the easy one: you merge to the main branch and Vercel rebuilds and publishes the website automatically — seconds later it's live, no app store, no review. MOBILE is the hard one: Apple requires that every iPhone app be compiled into a signed binary, uploaded to Apple, and (for brand-new versions) reviewed by a human before users can install it. That whole mobile pipeline is what Expo, EAS, the Apple Developer Program and App Store Connect are for.",
        },
        {
          t: "note",
          text: "Mental model: Vercel is to the website what EAS + the App Store is to the iPhone app. One is automatic; the other has a few manual, one-time-ish steps and Apple's review in the middle.",
        },
      ],
    },
    {
      id: "glossary",
      icon: "≣",
      title: "Glossary — what each thing actually is",
      summary: "The tools in the mobile pipeline, in plain English.",
      blocks: [
        {
          t: "term",
          term: "Expo",
          text: "A framework and toolkit built on top of React Native. It lets us write the whole iPhone app in TypeScript/React (the apps/mobile folder) without hand-managing Xcode and native iOS project files. Expo gives us the project structure, navigation (expo-router), ready-made native features (camera, blur, storage…), and the cloud build service. Think of it as 'Next.js, but for a native mobile app.'",
        },
        {
          t: "term",
          term: "expo.dev",
          text: "The website / cloud dashboard for Expo's hosted services. You make a free Expo account there; it's where your builds, app credentials and over-the-air updates live. Our command-line tools authenticate to expo.dev using an access token (the 'Expo token' we still need).",
        },
        {
          t: "term",
          term: "Expo Go",
          text: "A free app you install on your own phone from the App Store. During development it can load our app's JavaScript instantly (scan a QR code) so you can preview changes in seconds — no build required. Important: Expo Go is a DEVELOPMENT preview only. It is NOT how real users get the app, and apps with custom native bits don't fully run in it. Don't confuse 'it works in Expo Go' with 'it's shipped.'",
        },
        {
          t: "term",
          term: "Apple Developer Program",
          text: "A paid Apple membership (about $99/year) tied to an Apple ID. It's the legal + technical key to the App Store: only a member can create the signing certificates iOS demands and submit apps. Without it you cannot put the app on the store OR even on TestFlight. This is one of the two things currently blocking our mobile launch.",
        },
        {
          t: "term",
          term: "App Store Connect",
          text: "Apple's website (appstoreconnect.apple.com) for managing your apps once you have a developer account. It's where the app's store listing lives — name, screenshots, description, privacy answers — and where you manage TestFlight beta testers and press 'Submit for Review.' Our upload tool (EAS Submit) drops the built binary here; you finish the listing in the browser.",
        },
        {
          t: "term",
          term: "EAS (Expo Application Services)",
          text: "Expo's cloud service for building, submitting and updating the app. Three parts: (1) EAS Build compiles our app into a real iPhone binary (.ipa) in the cloud and handles Apple signing for us — no Mac needed. (2) EAS Submit uploads that binary to App Store Connect / TestFlight. (3) EAS Update pushes JavaScript-only changes over-the-air to apps people have already installed — like Vercel, but for the phone app's JS.",
        },
        {
          t: "term",
          term: "TestFlight",
          text: "Apple's beta-testing system, run from App Store Connect. After a build is uploaded you (and invited testers) can install the real app on your phones to try it before it goes public. A lighter review than a full App Store release — the normal first stop after a build.",
        },
        {
          t: "term",
          term: "The terminal (command line)",
          text: "The text window where you run the tools that have no button on a website: install dependencies (pnpm install), run the app locally (pnpm --filter @hybrid/mobile start), log in to Expo and trigger builds (eas login, eas build, eas submit), and run git/tests. Web barely needs it (Vercel is automatic). Mobile builds are kicked off from the terminal — though we can also wire them into GitHub Actions so even that becomes a button.",
        },
      ],
    },
    {
      id: "app-store",
      icon: "▲",
      title: "How to deploy the app to the App Store",
      summary: "The one-time setup, then the build → submit → review path.",
      blocks: [
        {
          t: "p",
          text: "You do the first three steps once. After that, shipping a new version is just the build/submit steps at the bottom.",
        },
        {
          t: "steps",
          items: [
            "Enroll in the Apple Developer Program ($99/year) with your Apple ID at developer.apple.com — this unlocks everything below.",
            "Create a free Expo account at expo.dev, then generate an access token (Account → Settings → Access tokens). That token is what lets the build tools act on your behalf.",
            "On your computer, install the EAS command-line tool and sign in: `npm i -g eas-cli`, then `eas login`.",
            "Configure the project once: `eas build:configure` (sets up eas.json) and confirm the iOS bundle identifier (e.g. app.hybrid) in the Expo app config.",
            "Build the iPhone binary in the cloud: `eas build --platform ios`. EAS creates the Apple certificates for you and produces a signed .ipa — no Mac required.",
            "In App Store Connect, create the app record (name + bundle id) so Apple has somewhere to receive the build.",
            "Upload it: `eas submit --platform ios`. This sends the binary to App Store Connect / TestFlight.",
            "Install via TestFlight on your phone and check it for real. Then in App Store Connect fill in the listing — screenshots, description, privacy answers — and press 'Submit for Review.'",
            "Apple reviews it (usually hours to a couple of days). Once approved, release it and it's live on the App Store.",
          ],
        },
        {
          t: "note",
          text: "Right now steps 1–2 are the blockers: we don't yet have the Apple Developer account or an Expo token. Our CI already compiles the iOS bundle on every PR, so we know the app BUILDS — we just can't sign and submit it until those two accounts exist.",
        },
      ],
    },
    {
      id: "updates",
      icon: "↻",
      title: "How do I update the app after I merge a PR?",
      summary: "Two paths — pick by whether the change is JavaScript-only or native.",
      blocks: [
        {
          t: "p",
          text: "The right way to ship an update depends on WHAT changed. The good news: most PRs (UI, logic, copy, screens) are JavaScript-only and can go out instantly without Apple's review.",
        },
        {
          t: "term",
          term: "JavaScript / content only (most PRs)",
          text: "If the PR only touched TypeScript, React components, styling or assets, use EAS Update (over-the-air): run `eas update --branch production` (or let CI do it). Installed apps quietly download the new bundle on next launch — no new build, no App Review, live in minutes. This is the phone-app equivalent of Vercel auto-deploy.",
        },
        {
          t: "term",
          term: "Native changes",
          text: "If the PR added a native module, upgraded the Expo SDK, changed the app icon/permissions, or bumped the app version, you must build a NEW binary: `eas build` then `eas submit`, then go through App Review again. Bump the version/build number first. Over-the-air updates can't change native code — only Apple-reviewed builds can.",
        },
        {
          t: "term",
          term: "The web + backend",
          text: "Merging to the main branch auto-deploys apps/web to Vercel — nothing to do by hand. Because BOTH clients call the same /api on Vercel, your backend changes ship with that web deploy and the mobile app picks them up immediately.",
        },
        {
          t: "note",
          text: "Rule of thumb: changed only TypeScript/React/assets → EAS Update (instant, no review). Changed anything native → new EAS Build + Submit + Apple review.",
        },
      ],
    },
    {
      id: "hosting",
      icon: "⬡",
      title: "Do I have to stay on Vercel, or can I use my own VPS?",
      summary: "You can self-host the web app — Vercel is just the lowest-effort default.",
      blocks: [
        {
          t: "p",
          text: "apps/web is a standard Next.js app, so you are NOT locked to Vercel. Vercel is simply the easiest host: it auto-deploys from GitHub, runs the /api routes as serverless functions, handles TLS and a global CDN, and needs zero server babysitting.",
        },
        {
          t: "p",
          text: "You CAN run it on your own VPS instead — build it (`next build`) and serve it (`next start`) behind nginx, or wrap it in Docker; platforms like Railway, Render or Fly.io sit in between. The trade-off: on a VPS you own the server, TLS certificates, scaling, env vars and uptime; Vercel does all of that for you. Pick a VPS for control/cost at scale, Vercel for speed and simplicity.",
        },
        {
          t: "note",
          text: "The mobile app only needs an HTTPS address for /api — wherever the backend lives, point the mobile app's API base URL at it and it keeps working. The database stays on Supabase either way; moving the web host doesn't move the data.",
        },
      ],
    },
    {
      id: "status",
      icon: "⚑",
      title: "Where HYBRID stands today",
      summary: "What's done, and the exact two things still blocking the mobile launch.",
      blocks: [
        {
          t: "p",
          text: "WEB is live and ships automatically: merge to main → Vercel deploys. MOBILE is built and its iOS bundle is verified by CI on every PR, but it has never been signed, submitted or run on a real device — because that needs two accounts we don't have yet.",
        },
        {
          t: "steps",
          items: [
            "Apple Developer Program membership ($99/year) — required to sign and submit the iPhone app and to use TestFlight.",
            "An Expo account + access token — required for EAS to build and submit on our behalf.",
          ],
        },
        {
          t: "note",
          text: "Once both exist, the 'How to deploy to the App Store' steps above are the entire path — there is no hidden extra work on our side. These blockers are also tracked in the Capabilities registry (mobile-preview / liquid-glass-mobile).",
        },
      ],
    },
  ],
};

/** All guides surfaced in the admin Guidance tab (room to add more later). */
export const GUIDES: Guide[] = [DEPLOY_GUIDE];
