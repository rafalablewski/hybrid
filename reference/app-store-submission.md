# App Store Connect — submission notes (HYBRID iOS)

Everything App Review and the App Privacy questionnaire need, kept in sync with
what the app actually does. **Fill the bracketed `[…]` operator values before you
submit.** Bundle id: `com.hybriddomain.xyz`.

---

## 1. App Privacy (the "Data Collection" questionnaire)

Answer these to **match `apps/mobile/app.json` → `ios.privacyManifests`** exactly
(App Review cross-checks the manifest against these answers). For every type
below: **Linked to the user? YES. Used for tracking? NO. Purpose: App
Functionality.** The app has **no third-party analytics/ads SDK** and does **no**
cross-app/cross-site tracking, so **App Tracking Transparency (ATT) does not
apply** and there is **no** `NSUserTrackingUsageDescription`.

| App Store data type | Category | Collected | Linked | Tracking | Purpose | Why |
|---|---|---|---|---|---|---|
| **Health** | Health & Fitness | Yes | Yes | No | App Functionality | HRV / sleep / readiness / injury (RTP) the user enters |
| **Fitness** | Health & Fitness | Yes | Yes | No | App Functionality | workouts, sets/loads, check-ins, body metrics |
| **Email Address** | Contact Info | Yes | Yes | No | App Functionality | account / sign-in |
| **Name** | Contact Info | Yes | Yes | No | App Functionality | profile display name |
| **User ID** | Identifiers | Yes | Yes | No | App Functionality | the account id that owns the data |
| **Photos or Videos** | User Content | Yes | Yes | No | App Functionality | optional progress photos (Storage) |

Notes for the reviewer-facing "Privacy Practices":
- **Data is not sold** and **not used for third-party advertising or tracking.**
- Users can **export** their data (Settings → Data → Download my data) and
  **delete their account** in-app (see §4).
- Wearable/third-party tokens (if a user connects one) are **encrypted at rest.**

> If you later add an analytics provider (see the `funnel-analytics` /
> `crash-reporting` capabilities), revisit this table, add the relevant types,
> and — if any SDK tracks across apps — enable ATT + add the usage string.

---

## 2. Encryption / export compliance

- `app.json` sets `ios.config.usesNonExemptEncryption = false`. **Accurate:** the
  app uses only **standard TLS** (HTTPS to Supabase/the API) and Apple-provided
  crypto (Keychain via `expo-secure-store`), both within Apple's export
  exemption. **No custom/proprietary encryption ships in the binary.**
- So in App Store Connect: **"Does your app use encryption?" → Yes → "Only
  exempt encryption (HTTPS/standard)."** No French self-classification / CCATS
  needed.

---

## 3. Sign in with Apple (Guideline 4.8)

**Not required for this binary.** The iOS app's login is **email/password only**
(`apps/mobile/components/aurora/login.tsx`) — it offers **no** third-party social
login, so 4.8 (which triggers only when you *offer* another social login) does
not apply. (The web app offers Apple + Google, which is fine and separate.)

> If you ever add Google sign-in to the iOS app, you **must** also add Sign in
> with Apple in the same build.

---

## 4. Account creation & deletion (Guideline 5.1.1(v))

- The app supports account creation, and now offers **in-app account deletion**:
  **Settings → Danger zone → "Delete my account"** (type `DELETE` to confirm).
  It hard-deletes all of the user's data and the login itself
  (`DELETE /api/account`). Point the reviewer here if they ask.
- There is also a separate **"Erase all my data"** (reset) that keeps the login —
  distinct from deletion.

---

## 5. In-App Purchase (auto-renewable subscription)

The paid **Full** tier is a native auto-renewable subscription.
- Product id: **`com.hybrid.full.monthly`** (must match `APPLE_IAP_PRODUCT_FULL`
  on the server and `EXPO_PUBLIC_IAP_PRODUCT_FULL` in the app).
- Before submitting, in App Store Connect: create the auto-renewable subscription
  product, add localized **price + subscription-length**, a **subscription
  display name**, and the **subscription group**; fill the **Review** screenshot.
- The paywall (`apps/mobile/components/aurora/upgrade.tsx`) shows the **localized
  StoreKit price**, a **Restore Purchases** button, and **Terms + Privacy** links
  (Guideline 3.1.2). Purchases route through **native IAP on iOS** (Stripe only on
  web/Android), so there is **no external-payment (3.1.1) issue**.
- The server verifies the transaction against Apple's App Store Server API
  (`/api/billing/iap/verify`) — set `APPLE_IAP_*` env (see `.env.example`).

**Reviewer note to include:** "The Full subscription unlocks the athlete toolkit.
Use the provided demo account (already Full) to review gated features, or tap
Unlock Full → Subscribe to exercise the sandbox purchase; Restore Purchases is on
the same screen."

---

## 6. Reviewer demo account & review notes

App Review must be able to reach everything without your infrastructure being a
black box.

**Demo account (fill in and keep it seeded):**
- Email: `[demo@yourdomain.com]`
- Password: `[strong-demo-password]`
- Entitlement: **Full** (set it so reviewers see the paid experience without
  purchasing — an admin can set entitlement, or grant it on this account).
- Seed it with a few workouts / check-ins so History, Trends, and the dashboards
  aren't empty.

**App Review notes (paste, with your values):**
> HYBRID is a hybrid-athlete training app. Sign in with the demo account above
> (email/password). Backend is Supabase + a Next.js API; no special network setup
> is needed. Key flows: log a workout (Train), view History/Trends, record a
> check-in, and — for the paid tier — Unlock Full → Subscribe (native IAP;
> Restore Purchases on the same screen). Account deletion is in
> Settings → Danger zone → Delete my account. Privacy Policy: `[https://…/privacy]`.
> Terms: `[https://…/terms]`. Support/contact: `[privacy@hybrid.app]`.

---

## 7. Metadata checklist (no placeholders — a common rejection)

- App name, subtitle, **description** (no lorem/placeholder), **keywords**.
- **Screenshots** for every required device size, from the real app (not mockups
  with unshipped features).
- **App icon** (already in `assets/`).
- **Privacy Policy URL** — set to `[https://<your-domain>/privacy]` (the page is
  live at `/privacy`; **first set the real legal entity + contact in
  `apps/web/app/legal/legal.ts`**).
- **Support URL** and marketing URL.
- **Age rating** — complete the questionnaire honestly. The app has
  **user-generated content** (social feed + profiles) with **moderation**
  (report/block + admin review), so answer the UGC questions accordingly; likely
  **12+** given social features, but let the questionnaire decide.
- **Primary category:** Health & Fitness.

---

## 8. Pre-submit sanity

- Build is on **TestFlight** (internal) from the "Mobile — build & TestFlight"
  workflow — smoke-test it on a real device first (the Keychain session storage
  and native IAP can only be exercised on-device).
- Confirm the **RLS SQL is applied** on the production Supabase project
  (`reference/sql-all.sql`) and verify with the `pg_class.relrowsecurity` query —
  the app's data isolation depends on it.
- Confirm `APPLE_IAP_*`, `TOKEN_ENCRYPTION_KEY`, and a shared rate-limit store are
  set in the server env.
