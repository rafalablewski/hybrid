# Shipping HYBRID to the App Store

This is the standalone **HYBRID** app (`app.hybrid.mobile`). It is built with
Expo and submitted through **EAS Build → App Store Connect**. Everything in the
repo is ready — icon, splash, version `1.0.0`, build number `1`, and the EAS
build profiles in [`eas.json`](./eas.json). The only remaining steps need your
own accounts and credentials, so they run **on your computer**, not in CI.

> Note: there is **no "Claude" anywhere in the app** — it ships as HYBRID. It
> was built *with* Claude Code, the way other apps are built with an IDE; that
> never appears in the binary or in App Store Connect.

## One-time prerequisites

1. **Apple Developer Program** membership ($99/yr) — https://developer.apple.com/programs/
2. An **Expo account** — https://expo.dev (free).
3. Your **Supabase anon (publishable) key** — Supabase dashboard → Project
   Settings → API → `anon public`.
4. Node + the repo installed locally:
   ```bash
   git clone https://github.com/rafalablewski/hybrid.git
   cd hybrid
   pnpm install
   ```

## Build + submit (run from `apps/mobile`)

```bash
cd apps/mobile

# 1. Sign in to Expo
npx eas login

# 2. Store the Supabase key as an EAS secret (used at build time by lib/supabase.ts).
#    The app reads EXPO_PUBLIC_SUPABASE_ANON_KEY; the URL is already defaulted.
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <your-anon-key>

# 3. Build + sign for iOS. EAS walks you through Apple login and
#    auto-manages provisioning profiles / signing certs the first time.
npx eas build --profile production --platform ios

# 4. Upload the finished build to App Store Connect / TestFlight.
npx eas submit --profile production --platform ios
```

`eas build` runs on Expo's macOS builders, so **you don't need a Mac**. When it
finishes, `eas submit` pushes the `.ipa` to App Store Connect; from there you
add it to TestFlight or submit it for review in the Apple web console.

## Faster iteration before submitting

You usually don't want a full store build for every change:

| Goal | Command |
|---|---|
| Click through the app on your phone (JS only) | `pnpm --filter @hybrid/mobile dev` → scan QR with **Expo Go** |
| Ship a JS change to an installed/TestFlight build (no new build) | `cd apps/mobile && pnpm update --message "what changed"` |
| Test camera / share (real native modules) | `npx eas build --profile development --platform ios` then run on device |
| Headless "does it bundle?" check (no device) | `pnpm --filter @hybrid/mobile export:ios` |
| Type check | `pnpm --filter @hybrid/mobile typecheck` |

> Expo Go can't run the **progress-photo camera** or the **share-image** capture
> — those need a real build (development profile or production). Everything else
> works in Expo Go.

## OTA updates (EAS Update) — stop burning build credits

A TestFlight build and a dev/preview build run on the **same EAS Build
quota** — switching to TestFlight does *not* save build credits. What burns
them is doing a full native build for every change. EAS Update fixes that: a
**JS/TS change** (screens, logic, styling — the majority of your work) ships
**over-the-air, for free**, to an already-installed build instead of a new
build. This is wired up here:

- `expo-updates` is installed.
- `app.json` → `updates.url` points at this project's EAS Update endpoint, with
  `runtimeVersion.policy: "fingerprint"` so an OTA update is **never** delivered
  to a binary it's incompatible with (the fingerprint changes when native deps
  change).
- `eas.json` build profiles each declare a `channel`
  (`development` / `preview` / `production`; the on-device `device` profile and
  TestFlight both track `production`).

Day-to-day loop:

```bash
cd apps/mobile

# JS/TS change only → push it over-the-air (free, ~seconds). The installed
# app (incl. the TestFlight build) picks it up on its next launch.
pnpm update --message "tweak the cockpit copy"     # = eas update --branch production

# Native code/deps changed (new Expo module, react-native-iap bump, etc.)
# → OTA can't carry native changes, so do a real build (consumes a credit):
npx eas build --profile production --platform ios && npx eas submit --profile production --platform ios
```

Publishing an OTA update needs Expo auth — run `npx eas login` once, or set an
`EXPO_TOKEN` robot secret in CI to publish automatically on merge.

> Running out of *this month's* free builds? The free-tier build limit resets
> monthly. To not wait, build locally (`eas build --local` or
> `npx expo run:ios` on a Mac — these don't touch Expo's cloud quota), or move
> to a paid EAS plan. You only need **one** more build to get onto TestFlight;
> OTA updates carry every JS change after that.

## Versioning for later updates

For each new release, bump the version in [`app.json`](./app.json):

- `expo.version` — the user-facing version (e.g. `1.0.1`), and
- `expo.ios.buildNumber` — must increase for **every** upload to App Store
  Connect, even if `version` is unchanged.

Then re-run steps 3–4 above.

## App Store Connect checklist (done in Apple's web console, not the repo)

EAS uploads the binary, but Apple still requires you to fill these in once:

- App name, subtitle, category, and description
- **Screenshots** (at least one 6.7" iPhone set)
- Privacy policy URL + the App Privacy questionnaire (this app collects health
  & fitness data and photos — declare them)
- Support URL and contact info

After that, submit for review from App Store Connect.
