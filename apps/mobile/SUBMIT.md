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

## Build + submit — LOCAL / Xcode (recommended: free, unlimited)

This is the path that doesn't touch Expo's cloud, so **nothing consumes the
EAS Build free-tier quota** — build as many times as you like. The only
requirement is a **Mac with Xcode** (HYBRID uses native Expo modules, so it
can't be built without a macOS toolchain). This is how the `sud-italia` apps
were shipped.

This repo uses **Continuous Native Generation** — there is no `ios/` folder
committed; you generate it with `expo prebuild` and it stays git-ignored.

```bash
cd apps/mobile

# 0. One-time: set the Supabase anon (publishable) key so the build can sign in.
#    Copy the example env and fill EXPO_PUBLIC_SUPABASE_ANON_KEY (it's public —
#    the same publishable key the web app ships). Expo auto-loads .env for
#    EXPO_PUBLIC_* vars at build time.
cp .env.example .env && $EDITOR .env

# 1. Generate the native iOS project from app.json + the config plugins.
pnpm prebuild:ios            # = expo prebuild --platform ios --clean

# 2a. FASTEST loop — build + install on a connected iPhone or the Simulator,
#     entirely on your Mac (no cloud, no signing ceremony for the Simulator):
pnpm run:ios                 # = expo run:ios   (add --device to pick a real phone)

# 2b. OR open the project in Xcode and Archive → Distribute → TestFlight.
#     Xcode signs interactively with your Apple ID (Automatically manage
#     signing), so the hardware-key-2FA / API-key limitation does NOT apply
#     here — Xcode can provision capabilities the EAS-cloud API-key path can't.
open ios/HYBRID.xcworkspace
#   In Xcode: pick a "Any iOS Device" target → Product ▸ Archive →
#   Distribute App ▸ TestFlight & App Store → Upload.
```

### Alternative: `eas build --local` (signed .ipa without opening Xcode)

Same idea — Expo's build logic, **on your Mac**, no cloud credits — but it
produces a distributable `.ipa` you can hand to `eas submit` or Transporter:

```bash
cd apps/mobile
pnpm build:local             # = eas build --local --profile production --platform ios
npx eas submit --profile production --platform ios --path ./build/hybrid.ipa
```

> `--local` still needs macOS + Xcode + CocoaPods installed; it just skips
> Expo's hosted builders (and therefore the metered free-build quota).

### Automated: GitHub Actions → TestFlight

`.github/workflows/mobile-release.yml` does the `eas build --local` + `eas
submit` above on a **macOS runner** — so CI builds to TestFlight without
consuming Expo's cloud build quota either. It runs only when you push a tag
like `mobile-v1.0.1` or trigger it from the Actions tab (never on normal
pushes — those stay on `ci.yml`).

It needs these repo secrets (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `EXPO_TOKEN` | Expo access token (expo.dev → Account → Settings → Access tokens) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The public Supabase anon/publishable key |
| `APPLE_ASC_API_KEY_P8_BASE64` | Your App Store Connect API `.p8`, base64-encoded (`base64 -i AuthKey_XXXX.p8`) |
| `APPLE_ASC_KEY_ID` | The `.p8` Key ID (e.g. `RQTCHVF25S`) |
| `APPLE_ASC_ISSUER_ID` | App Store Connect → Users and Access → Integrations → Issuer ID |

One-time prerequisite: run `eas credentials` locally for iOS once so the
distribution cert + provisioning profile exist on EAS for CI to fetch
non-interactively (the on-device build already did this).

## Cloud build (Expo builders) — no Mac, but metered

Only reach for this if you don't have a Mac. It runs on Expo's macOS builders
(so the binary builds without your own machine) but **every build consumes the
EAS Build free-tier quota** — this is the path that "ran out of free builds".

```bash
cd apps/mobile
npx eas login
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <your-anon-key>
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
```

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
