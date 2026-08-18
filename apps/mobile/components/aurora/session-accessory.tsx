import { useEffect, useSyncExternalStore } from "react";
import { View, Text } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { formatSessionElapsed } from "@hybrid/core";
import { loadDraft, type Draft } from "../../lib/draft";
import { useTheme } from "../../lib/theme";
import { fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";

/**
 * THE SESSION ACCESSORY — a workout in progress, in the system tab-bar
 * accessory (iOS 26+): Apple's home for players and active orders, the
 * mini-player slot. Persistent STATE belongs here; the tab bar itself carries
 * navigation only, which is why "start training" is a tab and "you are 24
 * minutes into Lower body A" is this.
 *
 * WHY THE MODULE-LEVEL STORE: the accessory's children are rendered TWICE, once
 * per placement (`regular` above the bar, `inline` beside the minimized bar),
 * with only one visible at a time. Per-component state would give the two
 * copies separate drafts and separate clocks, so they would disagree the moment
 * the bar minimized. The draft and the tick therefore live outside the
 * component and both copies subscribe to them.
 *
 * THE CLOCK IS THE STORE'S, not a component's. Driving it from an effect meant
 * BOTH copies ran their own interval — two timers a second apart, each writing
 * `now`, each waking every subscriber — for one clock that renders one figure.
 * It is the draft that decides whether time is being counted, so the store
 * starts the interval when a draft appears and clears it when one goes
 * (`syncClock`), and the copies only read. That also means the tick cannot
 * outlive the session or start twice.
 *
 * WHY THE STORE IS ALSO READ BY THE LAYOUT (`useSessionDraft`): rendering null
 * in here is NOT enough to make the accessory go away. UIKit builds the
 * accessory — its own glass capsule, its own height above the bar — from the
 * mere PRESENCE of the `<NativeTabs.BottomAccessory>` slot, so an empty child
 * left an empty bar hovering over the pills with nothing in it. The slot itself
 * has to be unmounted, which only the layout can do, so the layout subscribes
 * to the same draft and mounts the slot only when there is a minimized workout
 * to show. That also makes the layout the owner of the route-change re-read:
 * the accessory is gone exactly when a new draft would need to be noticed.
 */

type Snapshot = { draft: Draft | null; now: number };
let snapshot: Snapshot = { draft: null, now: Date.now() };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setSnapshot(next: Partial<Snapshot>) {
  const merged = { ...snapshot, ...next };
  // Cheap identity guard: re-emitting an unchanged snapshot would re-render
  // both copies every second even with no draft on screen.
  if (merged.draft === snapshot.draft && merged.now === snapshot.now) return;
  const draftChanged = merged.draft !== snapshot.draft;
  snapshot = merged;
  if (draftChanged) syncClock();
  emit();
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function getSnapshot() {
  return snapshot;
}
// The DRAFT alone, for subscribers that only care whether there is a session —
// the tab layout, which mounts the accessory slot on it. Handing them the whole
// snapshot would re-render them on every tick of a clock they never read.
function getDraft() {
  return snapshot.draft;
}

/** One interval, owned by the draft: running while there is one, gone when
 *  there isn't. Idempotent, so a redundant call cannot start a second. */
let clock: ReturnType<typeof setInterval> | null = null;
function syncClock() {
  const wanted = snapshot.draft != null;
  if (wanted && clock == null) clock = setInterval(() => setSnapshot({ now: Date.now() }), 1000);
  else if (!wanted && clock != null) {
    clearInterval(clock);
    clock = null;
  }
}

/** Re-read the persisted draft. Called on mount and on every route change. */
export async function refreshSessionAccessory(): Promise<void> {
  const d = await loadDraft().catch(() => null);
  // Compare by identity of the underlying values, not the object: loadDraft
  // parses fresh JSON each call, so a naive assignment would re-render forever.
  const same = (a: Draft | null, b: Draft | null) =>
    a === b || (a != null && b != null && a.title === b.title && a.startedAt === b.startedAt);
  if (!same(d, snapshot.draft)) setSnapshot({ draft: d });
}

/**
 * The live draft, for the tab layout: it mounts the accessory slot only while
 * this is non-null. Stays mounted across tab switches and pushes, so it also
 * carries the re-read on every route change.
 */
export function useSessionDraft(): Draft | null {
  const pathname = usePathname();
  const draft = useSyncExternalStore(subscribe, getDraft, getDraft);
  useEffect(() => { void refreshSessionAccessory(); }, [pathname]);
  return draft;
}

export default function SessionAccessory() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  // Read-only: both the draft and the clock are the store's (see the header).
  // The route-change re-read is useSessionDraft's, for the same reason — this
  // component is unmounted whenever there is no draft to notice one arriving.
  const { draft, now } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!draft) return null;

  const elapsed = formatSessionElapsed(draft.startedAt, now);

  // The minimized bar leaves room for a glance, not a sentence: inline drops
  // the title and the call to action and keeps the live clock.
  if (placement === "inline") {
    return (
      <Pressable
        onPress={() => router.navigate("/(tabs)/log")}
        accessibilityRole="button"
        accessibilityLabel={`${draft.title} — ${elapsed}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{elapsed}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.navigate("/(tabs)/log")}
      accessibilityRole="button"
      accessibilityLabel={`${draft.title} — ${elapsed}`}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime }} />
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.caption, color: C.chalk }}>
        {draft.title}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{elapsed}</Text>
    </Pressable>
  );
}
