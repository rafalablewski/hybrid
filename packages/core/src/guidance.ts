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
  | { t: "term"; term: string; text: string }
  /** A copy-able command block — one or more terminal lines (joined by "\n"). */
  | { t: "cmd"; lines: string }
  /** A two-column cheat-sheet: a goal on the left, the path to take on the right. */
  | { t: "matrix"; rows: { goal: string; path: string }[] };

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
  updated: "2026-06-17",
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
          term: "Apple Developer — Individual vs Organization",
          text: "You enroll in the program in one of two ways. INDIVIDUAL: enroll as yourself with your Apple ID — fastest (usually approved in a day), but the app is listed on the store under your personal name and you alone control the account. ORGANIZATION: enroll as a company/LLC — the app is listed under the business name, you can add team members with separate roles, and it shields your personal name. The org route needs (a) a legally registered entity (e.g. an LLC), (b) a D-U-N-S number — a free business identifier from Dun & Bradstreet that Apple uses to verify the company exists (request it at developer.apple.com/enroll; it can take a few days to a couple of weeks to issue), and (c) authority to bind the company. Both cost the same $99/year. Rule of thumb: shipping under a personal brand or just want to move now → Individual; shipping under a company/LLC, want the business name on the listing, or plan to add teammates → Organization. You can start Individual and migrate to Organization later, but it's smoother to pick the right one up front.",
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
            "Enroll in the Apple Developer Program ($99/year) at developer.apple.com — choose Individual (fast, listed under your name) or Organization (listed under your LLC/company, needs a D-U-N-S number; see the glossary). This unlocks everything below.",
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
          text: "EAS Update (over-the-air) is the EVENTUAL fast path for JS-only changes — `eas update` pushes a new bundle that installed apps pull on next launch, no rebuild and no App Review. IMPORTANT: it is NOT wired up in this repo yet (no expo-updates package or `updates`/`runtimeVersion` config), so TODAY even a pure TypeScript/React/styling change needs a fresh EAS Build. Until OTA is configured, treat EVERY mobile change as 'needs a build' — see the SANDBOX build section below for the internal-testing loop.",
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
          text: "Rule of thumb TODAY (no OTA configured): ANY change under apps/mobile → a fresh EAS Build. Backend/web changes ride the Vercel deploy and need no mobile build. And ALWAYS build from the branch you merged into — `git pull` first — because EAS bundles your local committed code, not what's on GitHub (see the SANDBOX build section).",
        },
      ],
    },
    {
      id: "sandbox-build",
      icon: "▣",
      title: "Updating the iOS SANDBOX build (internal testing on your iPhone)",
      summary: "Getting merged changes onto the internal-distribution build on your own device — and the two traps that bite.",
      blocks: [
        {
          t: "p",
          text: "This is the day-to-day loop BEFORE the App Store: an internal-distribution build (the `device` profile in eas.json) you install straight on your iPhone via a QR code — no TestFlight, no review. Because there is NO over-the-air update wired up in this repo, every mobile change needs a fresh build of this kind to appear on the phone.",
        },
        {
          t: "steps",
          items: [
            "Make sure your LOCAL clone is on the branch you actually merged into — usually `main`. EAS builds from your computer's COMMITTED git state, NOT from GitHub, so from your project folder (wherever you cloned it — e.g. `cd ~/hybrid`) run `git checkout main && git pull` FIRST. (Skipping this is the #1 cause of 'I rebuilt but the new features aren't there' — you just rebuilt old code. The web app looks updated because Vercel deploys from GitHub automatically; your Mac clone only updates when you pull.)",
            "Confirm the commit: `git log --oneline -1` should show the latest merge you expect. If it doesn't, stop — you're about to build stale code.",
            "`pnpm install` (dependencies may have changed across the merged PRs), then `cd apps/mobile`.",
            "Build for a real device: `npx eas build --platform ios --profile device` (internal distribution — NOT the simulator profiles).",
            "First time only: register the iPhone with `npx eas device:create` (follow the link on the phone to add its UDID), then re-run the build.",
            "When it finishes, open the QR / install link (terminal output or expo.dev → Builds) on the iPhone and install over the existing app.",
          ],
        },
        {
          t: "note",
          text: "No version bump needed for internal builds — `ios.buildNumber` only has to INCREASE for TestFlight / App Store uploads, not for internal-distribution installs. Rebuild as often as you like.",
        },
        {
          t: "term",
          term: "Trap 1 — you rebuilt but nothing changed",
          text: "Almost always a STALE CHECKOUT: your Mac was on an old branch, so EAS faithfully built old mobile code. Web looked fine because Vercel deploys from GitHub, not your laptop. Fix: `git checkout main && git pull` (then `pnpm install`) before every build, and verify with `git log --oneline -1`. Note: backend/API-only changes need no build at all — the app calls the same live Vercel /api — so only changes under apps/mobile (or core code that runs in the app) require a rebuild.",
        },
        {
          t: "term",
          term: "Trap 2 — Apple login fails on a security key",
          text: "If `eas build` dies on Apple sign-in saying two-factor 'cannot be handled' and lists Security Keys, it's because EAS/Fastlane can't complete a physical-security-key challenge. Fix: authenticate with an App Store Connect API KEY instead of an interactive login. In App Store Connect → Users and Access → Integrations → App Store Connect API, generate a Team key with the ADMIN role (App Manager is NOT enough — only an Admin key can reach the Certificates / Identifiers / Profiles API that EAS uses to create certs, register the device via `eas device:create`, and sync capabilities), download the .p8 ONCE, then in the same terminal export `EXPO_ASC_API_KEY_PATH` (path to the .p8), `EXPO_ASC_KEY_ID` and `EXPO_ASC_ISSUER_ID` before running the build — no password, no 2FA prompt. (Adding a trusted phone number to the Apple ID also lets Apple fall back to an SMS code, which EAS CAN handle; the API key is the durable fix and the one this project uses.)",
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
          text: "WEB is live and ships automatically: merge to main → Vercel deploys. MOBILE has now been SIGNED and RUN ON A REAL iPhone via an internal EAS build — the Apple Developer and Expo accounts both exist, Apple is authenticated with an App Store Connect API key (hardware-key 2FA blocks interactive login), and the build installs over a QR code. So the old 'two missing accounts' blockers are CLEARED; the day-to-day internal-testing loop is the SANDBOX build section above.",
        },
        {
          t: "p",
          text: "What's left is the PUBLIC App Store path (a TestFlight build + Apple's review) and a couple of follow-ons:",
        },
        {
          t: "steps",
          items: [
            "Public submission: `eas build --profile production --platform ios` then `eas submit` to push a build to App Store Connect / TestFlight, fill in the store listing (screenshots, description, privacy answers), and submit for review.",
            "Re-enable push: the expo-notifications plugin was stripped so the API-key build could ship — re-add it once the Push Notifications capability is on the Bundle ID. With an ADMIN-role App Store Connect API key EAS can sync that capability + provisioning profile for you (the earlier build skipped it because the key lacked that access); verify the profile actually includes it.",
          ],
        },
        {
          t: "note",
          text: "Status is tracked in the Capabilities registry: on-device builds are now SHIPPED (mobile-preview); push notifications remain blocked on push credentials (push-notifications).",
        },
      ],
    },
  ],
};

/**
 * "Accounts & identity" — the source-of-truth map of every account HYBRID runs
 * on: what's registered where, which email owns what, and the accounts still to
 * create. Tuned to the real setup: domain on GoDaddy, mail on Google Workspace,
 * Apple via an Organization (LLC, to be formed), production domain still hybrid.app.
 */
export const ACCOUNTS_GUIDE: Guide = {
  id: "accounts",
  title: "Accounts & identity — what's registered where",
  updated: "2026-06-16",
  sections: [
    {
      id: "map",
      icon: "⬡",
      title: "The account map (source of truth)",
      summary: "Every service needs an account and an owner email — here's the running inventory.",
      blocks: [
        {
          t: "p",
          text: "HYBRID runs on a handful of external services, each with its own login. Keeping one map of 'what's on which account' is what stops the 'wait, which email was that under?' problem later. This is that map — update it whenever an account is created or moved.",
        },
        {
          t: "note",
          text: "Domain naming: hybriddomain.xyz is the WORKING/placeholder domain we hold today; hybrid.app is the intended PRODUCTION domain (not acquired yet). The app's code uses hybrid.app names (app.hybrid.app, admin.hybrid.app) as placeholders — they'll point at the real domain once it's live. Don't treat the .xyz as final.",
        },
        {
          t: "term",
          term: "Domain — hybriddomain.xyz – GoDaddy – REGISTERED",
          text: "Registered through GoDaddy under the personal account Rafal.ablewski95@gmail.com. GoDaddy is the registrar AND where the DNS records live, so this is where you point the domain at a host (Vercel) or change email records. Note: the domain sits on a PERSONAL login — fine for now, but consider transferring it to the chosen business identity later so the whole stack lives under one owner.",
        },
        {
          t: "term",
          term: "Email — contact@hybriddomain.xyz – Google Workspace – LIVE",
          text: "The business mailbox, hosted on Google Workspace. Use it as the outward contact address, and it's the strongest candidate to OWN the product accounts below. Google Workspace also means the domain's MX/SPF/DKIM email records are already set in DNS — leave those alone when you wire the domain to a web host.",
        },
        {
          t: "term",
          term: "Code — github.com/rafalablewski/hybrid – on Rafal.ablewski95@gmail.com – MIGRATE LATER",
          text: "The monorepo (core + web + mobile). Currently on the PERSONAL gmail; to be migrated to the business identity later. Vercel deploys the web app from here; CI runs typecheck/tests + the iOS bundle export on every PR. When you migrate, transfer the repo into a GitHub Organization owned by the chosen account.",
        },
        {
          t: "term",
          term: "Web host — Vercel – on Rafal.ablewski95@gmail.com – MIGRATE LATER",
          text: "Hosts the Next.js web app and the shared /api the mobile app calls; auto-deploys the main branch. Currently on the PERSONAL gmail; to be migrated later. The production domain gets attached here (Vercel → Domains) once it's live. Database stays on Supabase regardless.",
        },
        {
          t: "term",
          term: "Database/auth — Supabase – on Rafal.ablewski95@gmail.com – MIGRATE LATER",
          text: "Postgres + auth for the whole product. Currently on the PERSONAL gmail; to be migrated later. Connection + service keys live as env vars in Vercel (and are referenced by the mobile app via the same API).",
        },
      ],
    },
    {
      id: "plan",
      icon: "❖",
      title: "Domain & email plan (decided)",
      summary: "The target architecture once hybrid.app is live; *@hybriddomain.xyz stands in until then.",
      blocks: [
        {
          t: "p",
          text: "This is the agreed layout. It supersedes the first-draft naming — web.hybrid.app became app.hybrid.app (to match the code + SaaS convention), and customerservice@ became support@. Everything below targets hybrid.app; until that domain is acquired, the equivalent @hybriddomain.xyz addresses stand in.",
        },
        {
          t: "term",
          term: "hybrid.app — landing",
          text: "The marketing/landing page with the funnel hook: a free first exercise and free signup, no card up front. Lives on the root domain.",
        },
        {
          t: "term",
          term: "app.hybrid.app — web client",
          text: "The signed-in web app (apps/web). Chosen over 'web.hybrid.app' because the code already uses app.hybrid.app and 'app.' is the universal convention for the product — there is no other client on a subdomain (mobile ships via the App Store).",
        },
        {
          t: "term",
          term: "admin.hybrid.app — admin console",
          text: "The operator console — already supported in the code via a middleware host rewrite. Admin-only, gated server-side.",
        },
        {
          t: "term",
          term: "no-reply@hybrid.app — transactional",
          text: "Confirmations, password resets, receipts. Set Reply-To: support@ so replies still reach a human. Sent through a transactional email provider (Resend / Postmark / SES) authenticated on hybrid.app — NOT Google Workspace SMTP.",
        },
        {
          t: "term",
          term: "marketing@hybrid.app — campaigns",
          text: "Newsletters and lifecycle marketing. A Google Workspace inbox (a human reads replies).",
        },
        {
          t: "term",
          term: "support@hybrid.app — customer service",
          text: "Support inbox (shortened from 'customerservice@'). A Google Workspace inbox, and the Reply-To target for the no-reply transactional mail.",
        },
        {
          t: "note",
          text: "Keep product and email on the SAME domain. Sending confirmations from @hybriddomain.xyz while the app is hybrid.app reads as phishing and hurts deliverability (SPF/DKIM/DMARC are configured per-domain). So when hybrid.app is acquired, move Google Workspace to hybrid.app and send from @hybrid.app; hybriddomain.xyz then becomes a redirect/placeholder only.",
        },
        {
          t: "note",
          text: "Two email 'pipes', both authenticated on hybrid.app: Google Workspace = mailboxes humans read (marketing@, support@); a transactional provider = automated machine mail (no-reply@). Don't push bulk automated confirmations through Workspace SMTP.",
        },
        {
          t: "term",
          term: "OPEN DECISION — cross-subdomain session",
          text: "Do you want a login on the landing page (hybrid.app) to carry into the web client (app.hybrid.app) already authenticated? If YES, the auth cookie must be scoped to .hybrid.app (a parent-domain cookie shared by all subdomains). Decide this before wiring the domains — it shapes the auth/cookie setup.",
        },
      ],
    },
    {
      id: "identity",
      icon: "⦿",
      title: "Which email owns what — DECIDE THIS FIRST",
      summary: "You haven't picked the account-owner email yet; choose before creating more accounts.",
      blocks: [
        {
          t: "p",
          text: "Before you open the Apple, Expo, Vercel or Supabase accounts, decide ONE email that owns them. Changing the owner of an Apple or Vercel account later is painful, so it's worth a minute now. This is currently UNDECIDED.",
        },
        {
          t: "term",
          term: "Recommendation",
          text: "Use a single business mailbox on the domain — contact@hybriddomain.xyz today, or a dedicated owner@/admin@ alias — as the owner of every product/business account (Apple Developer, Expo, Vercel, Supabase, GitHub org). Reasons: it survives team changes, isn't tied to anyone's personal inbox, and keeps the whole stack under one recoverable identity. Keep the personal gmail ONLY for the GoDaddy domain registration (and transfer even that over later if you want everything unified).",
        },
        {
          t: "note",
          text: "Current state: the domain (GoDaddy), GitHub, Vercel and Supabase are ALL on the personal Rafal.ablewski95@gmail.com today — flagged to migrate to the chosen business identity later. New accounts (Apple, Expo, Anthropic) should be created under the business email from the start so you're not migrating those too.",
        },
        {
          t: "note",
          text: "Whatever you pick, use it CONSISTENTLY and store the logins in a password manager with recovery set up. Mixing a personal gmail and a business address across services is exactly what creates the confusion. Once chosen, write the owner email next to each account in the map above.",
        },
      ],
    },
    {
      id: "todo",
      icon: "⚑",
      title: "Accounts still to create",
      summary: "The two that block the mobile launch, plus the keys the AI features need.",
      blocks: [
        {
          t: "term",
          term: "Apple Developer (Organization) — NOT STARTED – mobile blocker #1",
          text: "Enrolling as a COMPANY (your choice), so the app lists under the business name. This needs an LLC + a D-U-N-S number first — see the next section. $99/year. Until this exists, the iPhone app cannot be signed, TestFlight-tested or submitted.",
        },
        {
          t: "term",
          term: "Expo account + access token — NOT STARTED – mobile blocker #2",
          text: "A free account at expo.dev plus an access token, so EAS can build and submit the app on your behalf. Create it under the chosen identity email. This is the second of the two mobile blockers.",
        },
        {
          t: "term",
          term: "Anthropic API key — for the AI features",
          text: "ANTHROPIC_API_KEY (set server-side in Vercel) powers the AI coach and the admin AI agents. Create the Anthropic account under the identity email; scheduled agent runs additionally need CRON_SECRET. Not a launch blocker for the core app — only the AI surfaces need it.",
        },
        {
          t: "term",
          term: "Optional — Slack workspace",
          text: "Only if you want the admin AI-agent digests/approvals delivered to Slack (SLACK_WEBHOOK_URL / SLACK_SIGNING_SECRET). Skip until you want those notifications.",
        },
      ],
    },
    {
      id: "llc",
      icon: "▲",
      title: "The LLC → Apple Organization path",
      summary: "What forming the company and getting a D-U-N-S looks like, in order.",
      blocks: [
        {
          t: "p",
          text: "Because you chose the Organization route, the company has to exist (and be verifiable) before Apple will enroll it. Plan for this to take a couple of weeks of mostly waiting. Order of operations:",
        },
        {
          t: "steps",
          items: [
            "Form the LLC (or your local equivalent) — register the entity in your jurisdiction; you'll get a registered legal name and number.",
            "Request a D-U-N-S number for that exact legal name — it's free from Dun & Bradstreet (Apple links to the request at developer.apple.com/enroll). Apple uses it to confirm the company is real. Issuance takes a few days to ~2 weeks; you can't enroll the org without it.",
            "Make sure the company's legal name, address and phone match across the LLC registration, the D-U-N-S record and what you enter at Apple — mismatches are the #1 cause of enrollment delays.",
            "Enroll the Organization in the Apple Developer Program using the chosen identity email and the D-U-N-S number; confirm you have authority to bind the company. $99/year.",
            "Create the Expo account + token (no LLC needed for this), then follow the App Store runbook in the other guide — build with EAS, submit to App Store Connect, test via TestFlight, submit for review.",
          ],
        },
        {
          t: "note",
          text: "Faster alternative if you get impatient: you can enroll as an INDIVIDUAL now (approved in ~a day) to start TestFlight/build work, then switch to the Organization later. It's extra rework, so only do it if waiting on the LLC/D-U-N-S is blocking you.",
        },
      ],
    },
    {
      id: "dns",
      icon: "🌐",
      title: "Pointing the domain at the app (DNS)",
      summary: "How the GoDaddy domain connects to Vercel — without breaking Workspace email.",
      blocks: [
        {
          t: "p",
          text: "DNS records (managed in GoDaddy) decide where the domain sends traffic. Web hosting uses A/CNAME records; email uses MX/TXT records. They're independent — you can wire the web host without touching email, as long as you ONLY add the records the host asks for.",
        },
        {
          t: "steps",
          items: [
            "In Vercel → Project → Domains, add the domain (the placeholder app.hybriddomain.xyz now to preview, or hybrid.app + app./admin. once you own it). Vercel shows the exact records to set.",
            "In GoDaddy DNS, add those records: typically an A record on the root pointing to Vercel's IP (76.76.21.21) and a CNAME on each subdomain (app, admin) pointing to cname.vercel-dns.com. Use the values Vercel displays — they're authoritative.",
            "Leave the Google Workspace email records (MX, plus SPF/DKIM TXT) exactly as they are so contact@ keeps working.",
            "Wait for DNS to propagate (minutes to a few hours), then Vercel auto-issues the HTTPS certificate. The app is then live on the domain.",
            "Point the mobile app's API base URL at the same domain's /api so both clients hit one backend.",
          ],
        },
        {
          t: "note",
          text: "Golden rule: only ADD/EDIT the A and CNAME records the web host gives you. Never delete the MX or email TXT records — that's what silently breaks contact@hybriddomain.xyz.",
        },
      ],
    },
  ],
};

/**
 * "Run the app on an iPhone Simulator" — the absolute-beginner, copy-paste
 * runbook for opening HYBRID on Apple's iOS Simulator on a Mac (the mobile app
 * is a managed Expo / React-Native project, so this goes through Expo). Plain
 * language on purpose: someone who has never opened a terminal can follow it
 * top to bottom. Commands live in `cmd` blocks so the renderer gives each a
 * copy button; inline commands use `backticks` to match the other guides.
 */
export const SIMULATOR_GUIDE: Guide = {
  id: "simulator",
  title: "Run the app on an iPhone Simulator",
  updated: "2026-06-18",
  sections: [
    {
      id: "intro",
      icon: "◆",
      title: "Open HYBRID on a pretend iPhone",
      summary: "You don't need a real iPhone — a Mac can show one on screen.",
      blocks: [
        {
          t: "p",
          text: "You don't need a real iPhone to try the app. Your Mac (an Apple computer) can show a pretend iPhone right on the screen — like a toy phone you tap with your mouse. This guide tells you exactly what to type, one line at a time. Go from the top and do each box in order.",
        },
        {
          t: "note",
          text: "You can't break anything by following these steps, so don't worry. Every command box below has a copy button — copy it, paste it into the Terminal, and press Enter.",
        },
      ],
    },
    {
      id: "glossary",
      icon: "≣",
      title: "First, a few words explained",
      summary: "The scary-sounding words, in plain English.",
      blocks: [
        { t: "term", term: "Mac", text: "An Apple computer (a MacBook or iMac). The pretend iPhone only works on a Mac." },
        { t: "term", term: "Terminal", text: "A plain window where you TYPE instructions instead of clicking buttons. On a Mac, press Cmd+Space, type “Terminal”, and press Enter to open it." },
        { t: "term", term: "Type a command", text: "Copy the words from a command box below, paste them into the Terminal, and press Enter. That's it." },
        { t: "term", term: "Xcode", text: "A free Apple program. It's the thing that knows how to show the pretend iPhone." },
        { t: "term", term: "Simulator", text: "The pretend iPhone itself — a little phone-shaped window you can tap." },
        { t: "term", term: "The app code", text: "The HYBRID app's building blocks, kept in a folder we'll copy onto your computer." },
      ],
    },
    {
      id: "walkthrough",
      icon: "▶",
      title: "Do these in order — top to bottom",
      summary: "Steps 1–5 you do only ONCE (they set things up). Steps 6–7 are the ones you do every time. About 15 minutes.",
      blocks: [
        { t: "term", term: "1 – Get Xcode (once)", text: "On your Mac, open the App Store (the blue “A” icon), search for Xcode, and press Get / Install. It's big, so this can take a while. This only works on a Mac — not Windows or Linux." },
        { t: "term", term: "2 – Open Xcode once and let it set up", text: "Open Xcode once. If it asks you to agree to anything, click Agree and type your computer password if needed. Then in the top menu click Xcode → Settings → Components and download an iPhone option in the list (that's the pretend phone). Now you can close Xcode." },
        { t: "term", term: "3 – Install two helpers", text: "Open the Terminal. If you've never used it, first install “Homebrew” from brew.sh by pasting the one line on that website. Then paste these two lines, one at a time — `node` and `pnpm` are little tools the app needs:" },
        { t: "cmd", lines: "brew install node\nnpm install -g pnpm" },
        { t: "term", term: "4 – Copy the app onto your computer", text: "Still in the Terminal, paste these three lines (one at a time): line 1 downloads the app, line 2 steps INTO its folder, line 3 grabs the extra pieces it needs. The last one can take a couple of minutes — that's normal." },
        { t: "cmd", lines: "git clone https://github.com/rafalablewski/hybrid.git\ncd hybrid\npnpm install" },
        { t: "term", term: "5 – (Nice to have) one more small helper", text: "This just makes things smoother. Paste it; if it gives a little warning, that's okay — keep going." },
        { t: "cmd", lines: "brew install watchman" },
        { t: "term", term: "6 – Start the app's engine", text: "Paste this and press Enter. A lot of text appears and it looks like it's “waiting” — that's good. LEAVE THIS WINDOW OPEN; it's the app's engine running." },
        { t: "cmd", lines: "pnpm --filter @hybrid/mobile dev" },
        { t: "term", term: "7 – Open the pretend iPhone", text: "In that same window, press the letter i on your keyboard — i is for iPhone. Wait a little and a phone-shaped window pops up (that's the Simulator, run by Xcode) with HYBRID inside it. If it asks to install “Expo Go,” say yes. IMPORTANT: press i, NOT w — w opens the app in Safari (a web preview), which is the website, not the iPhone app. If Safari opened, go back to the engine window and press i." },
        { t: "term", term: "8 – That's it — play with it", text: "Tap around the pretend phone with your mouse, just like a real one. If you change something in the code it updates by itself. Press r to refresh, or i to open the phone again." },
        { t: "note", text: "Can't find or open the Simulator? Open it by hand: press Cmd+Space (Spotlight), type Simulator, press Enter — a phone-shaped window appears, and THAT is the Xcode Simulator. Leave it open, go back to the engine window (step 6) and press i. If nothing called “Simulator” shows up, Xcode isn't fully installed yet — do steps 1–2 first. If pressing i shows an error about Xcode, paste `sudo xcode-select -s /Applications/Xcode.app` (type your Mac password when asked — you won't see it as you type, that's normal), then press i again." },
        { t: "note", text: "You did it! Next time you only need steps 6 and 7. The app opens even with no key — you just can't SIGN IN yet, but you can still look around." },
        { t: "term", term: "Already set up? The whole thing in a few lines", text: "Get the newest code, then start the engine and press i (with your Simulator open). `git pull` + `pnpm install` are only needed when the code changed — otherwise just the last line, then i:" },
        { t: "cmd", lines: "cd hybrid\ngit checkout main\ngit pull\npnpm install\npnpm --filter @hybrid/mobile dev" },
        { t: "term", term: "Want to actually log in?", text: "You need one key called EXPO_PUBLIC_SUPABASE_ANON_KEY. An admin has it (in Supabase: Project Settings → API → `anon public`). Make a new file named `.env` inside the `apps/mobile` folder with this single line, swapping in the real key. Then stop the engine (click its window, press Ctrl+C) and start it again with step 6. Your `.env` stays on your computer — it's in `.gitignore` and never uploaded, which is why we never paste the real key onto this page." },
        { t: "cmd", lines: "EXPO_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-public-key-here" },
        { t: "note", text: "Got a red screen saying “Native module is null, cannot access legacy storage”? That just means the phone opened the app in Expo Go, a quick preview that can't do a few things this app needs (remembering your login, the camera, save-a-photo). It is NOT broken and NOT your fault. The fix is to build the full version once — do the “full app” section below — and the red screen is gone for good. Only want a quick peek? Tap Dismiss and look around." },
      ],
    },
    {
      id: "full-app",
      icon: "▣",
      title: "Recommended — the full app (fixes the red “Native module is null” error)",
      summary: "The version that actually works end-to-end: login, camera, save-a-photo.",
      blocks: [
        { t: "p", text: "This is the version that works end-to-end — login, camera, save-a-photo — and it's what makes the red “Native module is null” error go away. Do steps 1–5 above first. Then, instead of steps 6–7, build the full app. It takes a few extra minutes the first time." },
        { t: "term", term: "9 – Install one more helper (once)", text: "Paste this in the Terminal:" },
        { t: "cmd", lines: "brew install cocoapods" },
        { t: "term", term: "10 – Build it and open the pretend phone", text: "The FIRST time is slow (it's building the real app) — a few minutes is normal. After it finishes, the pretend iPhone opens with the camera and save-photo working:" },
        { t: "cmd", lines: "cd apps/mobile\nnpx expo run:ios" },
        { t: "note", text: "Prefer the “real Xcode” way (open the project and press ▶)? From the repo root run the three lines below — the last opens the project in Xcode. IMPORTANT: open the `.xcworkspace` file, NOT `.xcodeproj`. In Xcode set the scheme to HYBRID and the destination to a simulator, then press ▶ Play (or Cmd+R). If the app loads blank or red, Metro (the JavaScript engine) isn't running — start it in a second Terminal with `cd apps/mobile` then `pnpm start`. Note: `npx expo prebuild` creates an `ios/` folder — that's generated build output, already in `.gitignore`, so don't commit it." },
        { t: "cmd", lines: "cd apps/mobile\nnpx expo prebuild --platform ios\nopen ios/HYBRID.xcworkspace" },
      ],
    },
    {
      id: "cloud-build",
      icon: "⬡",
      title: "Extra — let a robot in the cloud build it for you",
      summary: "If building on your computer is too slow, ask Expo's cloud to build it.",
      blocks: [
        { t: "p", text: "If the full-app build above is too slow or grumpy on your computer, you can ask Expo's online helpers to build it. (You still need a Mac to open the pretend phone at the end.) Sign in and ask for a build — it makes you a free Expo account the first time, and gives you a download link when it finishes:" },
        { t: "cmd", lines: "cd apps/mobile\nnpx eas login\nnpx eas build --profile preview --platform ios" },
        { t: "term", term: "Drop it onto the pretend phone", text: "Download the file it gives you, unzip it to get a `HYBRID.app`, open the pretend iPhone, and drag the app onto it. Or paste these two lines:" },
        { t: "cmd", lines: "xcrun simctl install booted HYBRID.app\nxcrun simctl launch booted app.hybrid.mobile" },
        { t: "note", text: "For login to work in this version too, an admin needs to add the secret key EXPO_PUBLIC_SUPABASE_ANON_KEY (the steps are in `apps/mobile/SUBMIT.md`)." },
      ],
    },
    {
      id: "reload",
      icon: "↻",
      title: "After we change the app — get the latest & reload",
      summary: "How to see an update. Usually you do NOT have to quit Expo or start over.",
      blocks: [
        { t: "term", term: "1 – Leave the engine running — open a NEW Terminal tab", text: "Keep the “engine” window (the one running Expo) open. Open a SECOND tab with Cmd+T and do the git steps there." },
        { t: "term", term: "2 – Get the newest code", text: "In the new tab, paste these one line at a time. Only run `pnpm install` afterwards if the update added new pieces. Paste each command on its OWN line — no notes after it (see the warning below):" },
        { t: "cmd", lines: "cd hybrid\ngit pull" },
        { t: "term", term: "3 – Reload the pretend phone", text: "Click the Simulator window once, then press Cmd+R. (Or press r in the engine window.) Often you don't even need this — the app refreshes by itself when files change (“Fast Refresh”)." },
        { t: "note", text: "When pasting, don't add a note after a command on the same line. The Mac Terminal (zsh) does NOT treat # as a comment — it feeds those words to the command, so `pnpm install  # only if deps changed` errors with ERR_PNPM_ADDING_TO_ROOT (nothing actually broke). Just paste the command by itself." },
        { t: "note", text: "Reload, or fully restart? A reload (Cmd+R) is enough for normal code changes. Fully restart — stop with Ctrl+C, then redo step 6 (or step 10 for the full build) — only when (a) new dependencies were added, or (b) native code changed (rebuild with `npx expo run:ios`). If it ever looks stale, restart with a clean cache: `npx expo start -c`." },
        { t: "note", text: "Not every update touches the phone app. Changes to the WEBSITE (like this admin page) don't affect the app in the Simulator at all — nothing to pull or reload. Only changes under `apps/mobile` (or the shared core) need the steps above. To check your branch is current, run `git branch --show-current` and `git status` — it should say “up to date with ‘origin/main’.”" },
      ],
    },
    {
      id: "cheat-sheet",
      icon: "❖",
      title: "Not sure which to do? Here's a cheat sheet",
      blocks: [
        {
          t: "matrix",
          rows: [
            { goal: "I want it to work properly (login, no red errors)", path: "Steps 1–5, then 9–10" },
            { goal: "I just want a quick peek (red errors are OK)", path: "Steps 1–8, tap Dismiss" },
            { goal: "Building on my computer is too slow", path: "Use the cloud robot" },
            { goal: "I only want to check it doesn't crash", path: "pnpm --filter @hybrid/mobile export:ios" },
          ],
        },
      ],
    },
    {
      id: "troubleshooting",
      icon: "⚑",
      title: "If something looks wrong (don't panic)",
      summary: "The common snags and the one-line fix for each.",
      blocks: [
        { t: "term", term: "Red screen: “Native module is null, cannot access legacy storage”", text: "(Often with AsyncStorageError.) The app opened in Expo Go, the quick preview, which doesn't include everything this app needs — the most common snag. Fix: build the full version once with the “full app” section above (`cd apps/mobile` then `npx expo run:ios`). After that one build the red screen is gone for good. You can tap Dismiss to peek around meanwhile, but login won't work until you build the full version." },
        { t: "term", term: "“Verifying ‘iOS… simruntime’” has been stuck for ages", text: "That's your Mac unpacking the pretend-iPhone files the very first time — it's several gigabytes, so it can take 5–20 minutes and the bar often looks frozen near the start. Let it finish; don't cancel. It only does this once. (If it truly never moves, your Mac may be low on free disk space.)" },
        { t: "term", term: "Lots of red “CHHapticPattern” / “hapticpatternlibrary.plist” lines", text: "Or “Failed to send CA Event for app launch measurements.” These are SAFE TO IGNORE — the pretend phone has no vibration hardware and no real-device stats, so it grumbles. If you also see a line like “iOS Bundled … (NNNN modules)”, the app is running fine." },
        { t: "term", term: "“Your local changes would be overwritten by merge”", text: "Something edited a file on your computer and it's blocking `git pull`. To throw away that local change and take the latest, run the two lines below (swap in whatever filename the message named), then start again from step 6:" },
        { t: "cmd", lines: "git checkout -- apps/mobile/package.json\ngit pull" },
        { t: "term", term: "“No package.json found” or “cd: no such file or directory: apps/mobile”", text: "You're not inside the app's folder. Type `cd hybrid` first, then redo the command. `pnpm install` must be run from the hybrid folder, not your home folder." },
        { t: "term", term: "Red screen: “No script URL provided”", text: "(Also says unsanitizedScriptURLString = (null).) The app built and opened fine, but Metro — the thing that serves the app's JavaScript — isn't running. This happens with the Xcode ▶ method, which doesn't start Metro for you. Open a new Terminal window and start it with `cd apps/mobile` then `pnpm start`, leave it open, then reload in the Simulator (Cmd+R, or tap R twice). Still red? In the `pnpm start` window press r, or restart with a clean cache: `npx expo start -c`. The Xcode method needs TWO things running — Metro AND the app. (Pressing i starts Metro automatically, so you never see this.)" },
        { t: "term", term: "I pressed a key to reload and nothing happened (or a new tab opened)", text: "Cmd+T opens a new Terminal tab — it does NOT reload the app. To reload: click the Simulator window once so it's in front, then press Cmd+R — or press r in the engine (Expo) window. Cmd+D in the Simulator opens a menu with a Reload button too." },
        { t: "term", term: "ERR_PNPM_ADDING_TO_ROOT (or it complained about words from my note)", text: "You pasted a command with a # note after it on the same line. The Mac Terminal doesn't treat # as a comment — it ran your note as part of the command. Nothing broke; just paste the command on its own, e.g. `pnpm install` by itself." },
        { t: "term", term: "“supabaseKey is required”", text: "An old bug — the app crashed when it had no login key. It's fixed now. Get the fix by pulling the latest code: `cd hybrid` then `git pull`, then start again from step 6. The app opens even without a key (you just can't sign in until you add one — see “Want to actually log in?” above)." },
        { t: "term", term: "It opened in Safari, not a phone window", text: "You pressed w (web) or clicked a link. That's only a website preview, not the iPhone app. Go back to the engine window and press i (for iPhone) — that's the one that opens the pretend phone via Xcode." },
        { t: "term", term: "I pressed i and no phone showed up", text: "Go back to step 2 and make sure you downloaded an iPhone in Xcode → Settings → Components. Then try i again." },
        { t: "term", term: "It says a lot of red words", text: "Red usually just means “try again.” Close the Terminal, open it fresh, go back into the folder with `cd hybrid`, and redo the last step." },
        { t: "term", term: "The app looks stuck or weird", text: "In the engine window, run `npx expo start -c` — that gives it a clean fresh start." },
        { t: "term", term: "I'm totally stuck", text: "That's okay! Copy the red words you see and show them to an admin or developer — they'll know what to do." },
        { t: "note", text: "For admins: this can only be done on a real Mac. It can't run inside this website's sandbox (there's no Mac here and the database is blocked)." },
      ],
    },
  ],
};

/** All guides surfaced in the admin Guidance tab (room to add more later). */
export const GUIDES: Guide[] = [DEPLOY_GUIDE, ACCOUNTS_GUIDE, SIMULATOR_GUIDE];
