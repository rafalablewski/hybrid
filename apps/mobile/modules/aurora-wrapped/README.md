# aurora-wrapped — native SwiftUI wrapped card (iOS)

A local Expo native module that renders the **SwiftUI** wrapped-story theme
(Aurora's ink+lime identity with the iOS treatment: a system gradient and a
`.ultraThinMaterial` slab) in **real SwiftUI** on iOS.

## Status: scaffolded, NOT yet compiled/verified

This was written in a sandbox **without Xcode**, so the Swift has not been built
or run. It compiles only on a Mac / EAS build. Until then the app falls back to
the cross-platform RN card (`SlideStoryCard`) for the SwiftUI theme, so the
feature works on every client today (web↔mobile parity is preserved). Tracked in
`packages/core/src/capabilities.ts` under `swiftui-kit`.

## How it wires up

- **Native:** `ios/AuroraWrappedModule.swift` registers a view named
  `AuroraWrapped` with one prop, `payload` (a JSON string). `AuroraWrappedView`
  hosts the SwiftUI `AuroraWrappedCard` via `UIHostingController`.
- **JS:** `index.tsx` exposes `AuroraWrappedNative` + `auroraWrappedNativeAvailable`
  (false in Expo Go / JS-only). `app/workout.tsx` builds the `payload`
  (`slidePayload`) and renders the native view **only when available**, else the
  RN fallback. The native view is a real UIView, so `react-native-view-shot`
  captures it for the share image — the existing share flow is unchanged.

## Build / verify on a Mac

```bash
cd apps/mobile
npx expo prebuild -p ios        # generates ios/ and autolinks this module
npx expo run:ios                # or an EAS build
```

The `payload` JSON contract (kept in sync with `slidePayload` in
`app/workout.tsx`) is decoded by `WrappedModel` in `ios/AuroraWrappedCard.swift`:

```
{ kind: "overview"|"prs"|"muscle"|"fun", eyebrow, tracked,
  title?, stats?: [{label,value}],
  headline?, rows?: [{left,right,hot}],
  bars?: [{label,value,pct}],
  emoji?, text? }
```
