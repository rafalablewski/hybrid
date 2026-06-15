# Running HYBRID in the iOS Simulator (local dev)

How to run the **HYBRID** mobile app on the iOS Simulator on your Mac, with the
exact gotchas this project hits and how to get past them. For shipping to the
App Store instead, see [`SUBMIT.md`](./SUBMIT.md).

> **macOS only.** The iOS Simulator and Xcode run only on a Mac. You can't do
> this from Windows, Linux, or a cloud sandbox.

## One-time prerequisites

1. **Xcode** — install from the Mac App Store, open it once to accept the
   license, and let it install components.
2. **An iOS Simulator runtime** — Xcode → Settings → Components (or Platforms) →
   install an iOS runtime. (First boot of a new runtime is slow — see
   [Troubleshooting](#troubleshooting).)
3. **Command line tools** — `xcode-select --install`
4. **Node, pnpm, Watchman, CocoaPods**:
   ```bash
   brew install node watchman cocoapods
   npm install -g pnpm
   ```

## Setup (run from the repo root)

The repo's top-level `package.json` + `pnpm-workspace.yaml` live at the **root**.
`apps/mobile` only exists relative to that root, so commands must run from the
right place.

```bash
# 1. Get the repo (skip if you already have it). Then cd into it.
git clone https://github.com/rafalablewski/hybrid.git
cd hybrid

# 2. Make sure you're up to date (see Troubleshooting if pull is blocked).
git pull

# 3. Install all workspace deps — MUST be run from the repo root.
pnpm install
```

### Add your Supabase key

The app reads `EXPO_PUBLIC_SUPABASE_ANON_KEY`; the Supabase URL and API URL are
already defaulted in [`lib/supabase.ts`](./lib/supabase.ts) and
[`lib/api.ts`](./lib/api.ts). Without the key the app still launches, but the
login screen stays disabled.

Create `apps/mobile/.env` (already gitignored — never commit it):

```bash
cd apps/mobile
cat > .env <<'EOF'
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
# optional overrides (already defaulted in code):
# EXPO_PUBLIC_SUPABASE_URL=https://hgufkvwccodogieqygyy.supabase.co
# EXPO_PUBLIC_API_URL=https://hybrid-web-rosy.vercel.app
EOF
```

> Get the anon key from the Supabase dashboard → Project Settings → API →
> `anon public`. It's safe to use in a client app (it's protected by Row Level
> Security) — but still don't commit it.

## Run it

```bash
cd apps/mobile
npx expo run:ios
```

This builds a **native dev build** (with all native modules baked in), boots the
Simulator, and installs the app. First run takes a few minutes; later runs are
fast.

**Use `npx expo run:ios`, NOT plain Expo Go.** This app enables the New
Architecture and uses custom native modules (AsyncStorage, notifications,
image-picker, blur). Expo Go doesn't include them and will crash — see
[Troubleshooting](#troubleshooting).

After the one-time `run:ios` build, you can use the dev server directly:

```bash
npx expo start    # then press 'i' to open iOS — uses the dev build, not Expo Go
```

Handy keys while Metro is running:

| Key | Action |
|---|---|
| `i` | open iOS Simulator |
| `r` | reload the app |
| `Cmd+D` (in Simulator) | open the dev menu |

## Troubleshooting

These are the exact issues you're likely to hit, in order.

### `No package.json found` / `cd: no such file or directory: apps/mobile`
You're not in the repo. `pnpm install` must run from the **repo root** (`hybrid/`),
and `apps/mobile` is relative to it. `cd` into the repo first. To find it:
```bash
find ~ -name CLAUDE.md -path '*hybrid*' 2>/dev/null
```

### `destination path 'hybrid' already exists`
You've already cloned it. Don't re-clone — just `cd hybrid` and continue.

### `git pull` aborts: "local changes would be overwritten"
Something edited a tracked file (often `apps/mobile/package.json`). Inspect, then
discard or stash:
```bash
git diff apps/mobile/package.json     # see what changed
git checkout -- apps/mobile/package.json   # discard if you don't want it
# — or keep it —
git stash && git pull && git stash pop
```

### Red screen: `AsyncStorageError: Native module is null`
You're running in **Expo Go**, which doesn't bundle native modules. Stop the
server (`Ctrl+C`) and build the dev client instead:
```bash
npx expo run:ios
```
This is the single most common trap for this app — it is **not** a code bug.

### `pod: command not found`
CocoaPods isn't installed: `brew install cocoapods`, then re-run `expo run:ios`.

### "Verifying \"iOS XX.simruntime\"…" sits for ages
macOS is unpacking/verifying the Simulator runtime (several GB) — a one-time
step. It can take 5–20 min and the progress bar often looks stuck near the start.
Let it finish; don't cancel. If it truly hangs, check free disk space. Inspect
state from another terminal:
```bash
xcrun simctl runtime list
```

### Harmless Simulator log noise (safe to ignore)
The app is fine if you see `iOS Bundled … (NNNN modules)`. These are Simulator
limitations, not app bugs:
- **`CHHapticPattern` / `hapticpatternlibrary.plist` not found`** — the Simulator
  has no haptics hardware; `expo-haptics` no-ops. Works on a real iPhone.
- **`Failed to send CA Event for app launch measurements`** — Apple launch
  telemetry, real devices only.
- **`RCTScrollViewComponentView implements focusItemsInRect:`** — a UIKit focus
  caching note; irrelevant here.

## Opening it in Xcode directly (optional)

Expo apps don't check in an Xcode project — you generate it:

```bash
cd apps/mobile
npx expo prebuild --platform ios     # creates ios/ with the Xcode workspace
open ios/HYBRID.xcworkspace          # open the .xcworkspace (not .xcodeproj)
```

Pick a simulator in Xcode's device dropdown and hit ▶ Run. Note `ios/` is
generated output (gitignored, rebuilt by prebuild) — don't hand-edit it;
configure via [`app.json`](./app.json) instead.
