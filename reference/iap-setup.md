# IAP go-live runbook — "Full" subscription

Status: all **code** is done (server verification, Apple root certs, native
purchase client). What's left is **operational** — done in App Store Connect,
then env vars, then an EAS build to test. This is the step-by-step.

You have: the Apple Developer account + the sandbox `.p8` key (Key ID
`RQTCHVF25S`). That's enough for everything in Phase 1 and 2 below.

---

## Phase 1 — App Store Connect (needs only the Apple Developer account)

Do these now; none of them need Expo or a build.

1. **Sign the Paid Apps Agreement.**
   App Store Connect → **Business** (Agreements, Tax, and Banking) → accept the
   Paid Applications agreement and fill tax + banking.
   ⚠️ Until this is active, subscription products **won't load even in sandbox**.

2. **Register the Bundle ID.**
   developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers** →
   `+` → App IDs → App → e.g. `com.hybrid.app`. Write down the exact string.
   → this is **`APPLE_IAP_BUNDLE_ID`**.

3. **Create the app record.**
   App Store Connect → **Apps** → `+` → New App, using the Bundle ID from step 2.

4. **Create the subscription product.**
   In the app → **Subscriptions** → create a Subscription Group (e.g. "HYBRID
   Full") → add a subscription:
   - **Product ID**: `com.hybrid.full.monthly` (or your choice — must match the
     env var below). → this is **`APPLE_IAP_PRODUCT_FULL`**.
   - Duration: **1 month**, auto-renewable.
   - Price: pick a tier (we discussed **$4.99–7.99/mo**; consider adding an
     annual product later for LTV).
   - Add a display name + description (required to leave "Missing Metadata").

5. **Grab the Issuer ID.**
   App Store Connect → **Users and Access** → **Integrations** → App Store
   Connect API. The **Issuer ID** (a UUID) is shown at the top of the keys list —
   the same page your `.p8` came from. → this is **`APPLE_IAP_ISSUER_ID`**.

6. **(Production only — skip for sandbox) Note the numeric App Apple ID.**
   App → **App Information** → "Apple ID" (a number).
   → **`APPLE_IAP_APP_APPLE_ID`** (only required when running ENV=Production).

7. **Create a sandbox tester.**
   Users and Access → **Sandbox** → Testers → `+`. Use an email you control that
   is NOT an existing Apple ID. You'll sign into this on the test device.

### 📨 After Phase 1, send me these three values and I'll wire them in:
- `APPLE_IAP_BUNDLE_ID`  (step 2)
- `APPLE_IAP_PRODUCT_FULL`  (step 4)
- `APPLE_IAP_ISSUER_ID`  (step 5)

(The `.p8` private key you already gave me; it goes in env as
`APPLE_IAP_PRIVATE_KEY`, never in git.)

---

## Phase 2 — Server env vars (you set these in Vercel)

Vercel → Project → Settings → Environment Variables. From `.env.example`:

```
APPLE_IAP_PRIVATE_KEY   = <the .p8 file contents, newlines as \n>
APPLE_IAP_KEY_ID        = RQTCHVF25S
APPLE_IAP_ISSUER_ID     = <from step 5>
APPLE_IAP_BUNDLE_ID     = <from step 2>
APPLE_IAP_PRODUCT_FULL  = com.hybrid.full.monthly
APPLE_IAP_ENV           = Sandbox          # switch to Production at launch
# APPLE_IAP_APP_APPLE_ID = <number>        # only for Production
```

The Apple root CA certs are already committed, so `APPLE_ROOT_CERTS_DIR` needs no
value. Redeploy after setting these; the verify route stops returning 503.

Also set the entitlement-mirror + Stripe keys if not already (separate
capabilities `entitlement-mirror`, `full-billing-stripe`).

---

## Phase 3 — Build & test on a device (needs Expo, which you don't have yet)

react-native-iap is a native module — it can't run in Expo Go or the web
preview, only in a real build. So:

1. **Create a free Expo account** at expo.dev, then an **access token**
   (Account → Settings → Access Tokens). That token is the only thing currently
   gating the build.
2. `npm i -g eas-cli`, then from `apps/mobile`: `eas login`, `eas build:configure`.
3. Build a **development or TestFlight** build:
   `eas build --profile development --platform ios`
   (EAS will walk you through Apple credentials/provisioning using your dev acct).
4. Install on your iPhone, **sign OUT of the App Store and into the sandbox
   tester** (Settings → App Store, or you'll be prompted at purchase).
5. Open HYBRID → Upgrade → **Subscribe** → complete the sandbox purchase.
   The app POSTs the transactionId → `/api/billing/iap/verify` verifies it
   against Apple's **Sandbox** servers → grants Full → the screen unlocks.

The first sandbox purchase is the real end-to-end test — none of this can be
exercised before a build exists.

---

## Phase 4 — Launch

- Flip `APPLE_IAP_ENV` to `Production` and set `APPLE_IAP_APP_APPLE_ID`.
- Submit the subscription + app for App Review.
- (Optional) add an **annual** product for better LTV.

---

## Cheat-sheet: where each value comes from

| Env var | Source |
|---|---|
| `APPLE_IAP_PRIVATE_KEY` | the `.p8` file contents |
| `APPLE_IAP_KEY_ID` | the `.p8` filename → `RQTCHVF25S` |
| `APPLE_IAP_ISSUER_ID` | Users and Access → Integrations (Phase 1.5) |
| `APPLE_IAP_BUNDLE_ID` | Identifiers (Phase 1.2) |
| `APPLE_IAP_PRODUCT_FULL` | Subscription product id (Phase 1.4) |
| `APPLE_IAP_APP_APPLE_ID` | App Information (Phase 1.6, Production only) |
| `EXPO_PUBLIC_IAP_PRODUCT_FULL` | same as `APPLE_IAP_PRODUCT_FULL`, in `apps/mobile/.env` |
