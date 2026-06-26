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

## Build + submit — GitHub Actions, NO Expo, NO Mac (recommended)

`.github/workflows/mobile-release.yml` builds the app on a **GitHub cloud Mac
with Apple's own tools** (Xcode + Fastlane) and uploads it to TestFlight. There
is **no Expo build service** — `expo prebuild` is only local code-gen (no Expo
account/token), and every credential talks to Apple directly. Because the repo
is public, GitHub Actions is **free and unlimited** — no build quota, ever.

Signing is handled automatically by `codemagic-cli-tools` (open-source, **not**
the codemagic.io service): it creates and reuses the Apple Distribution cert +
profile from your App Store Connect API key — no Keychain export, no `.p12`.

**One-time setup:**

1. **Generate a signing key once** (no Keychain, no Xcode — just one command):
   ```
   openssl genrsa 2048 | pbcopy
   ```
   That copies a private key to your clipboard. The tooling uses it to create
   and then reuse the distribution certificate on every run.

2. Add these repo secrets (GitHub → **Settings → Secrets and variables →
   Actions → New repository secret**):

   | Secret | What it is |
   |---|---|
   | `APPLE_CERT_PRIVATE_KEY` | **paste** the key from step 1 |
   | `APPLE_ASC_API_KEY_P8` | Full contents of your App Store Connect API `.p8` (BEGIN/END lines included) |
   | `APPLE_ASC_KEY_ID` | The `.p8` Key ID — `ZRWGCS2PUS` |
   | `APPLE_ASC_ISSUER_ID` | App Store Connect → Integrations → Issuer ID |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The public Supabase anon/publishable key |

   (Any old `EXPO_TOKEN` secret is no longer used — delete it.)

3. Go to **GitHub → Actions → "Mobile — build & TestFlight" → Run workflow**
   (or push a tag like `mobile-v1.0.1`). It auto-increments the build number from
   TestFlight and uploads. Normal pushes/PRs stay on `ci.yml`.

> If the first run fails with an **"already have a Distribution certificate" /
> certificate-limit** error, you're at Apple's 2-cert cap (from the earlier
> Expo + Xcode builds). Revoke the old one at
> [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list)
> (the Expo/EAS "iPhone Distribution" one — you don't need it anymore) and re-run.
> One click, one time.

## Optional: build locally on a Mac (free & unlimited)

Only if you ever want to escape the cloud build quota entirely. A local build
doesn't touch Expo's builders, so you can build as many times as you like — but
it needs a **Mac with Xcode** (HYBRID uses native Expo modules, so it can't be
built without a macOS toolchain) and the repo cloned. The repo is **Continuous
Native Generation** — no `ios/` folder is committed; `expo prebuild` generates
it and it stays git-ignored.

```bash
git clone https://github.com/rafalablewski/hybrid.git && cd hybrid
pnpm install
cd apps/mobile
cp .env.example .env
```

Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (public publishable key), then:

```bash
pnpm prebuild:ios     # generate ios/ from app.json + config plugins
pnpm run:ios          # build + install on a device/Simulator (add --device)
```

…or open `ios/HYBRID.xcworkspace` in Xcode → "Any iOS Device" → Product ▸
Archive → Distribute App ▸ TestFlight. (Xcode signs interactively with your
Apple ID, so the hardware-key-2FA / API-key limitation doesn't apply locally.)
For a signed `.ipa` without opening Xcode: `pnpm build:local` then `npx eas
submit --profile production --platform ios --path ./build/hybrid.ipa`.

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
