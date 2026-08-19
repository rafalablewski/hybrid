import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AURORA_NAV_TABS, AURORA_NAV_ACTIONS, auroraNavAction } from "@hybrid/core";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { useNavSurface, runNavAction } from "../../lib/nav-surface";
import SessionAccessory, { useSessionDraft } from "../../components/aurora/session-accessory";

/**
 * THE BOTTOM NAV — the real system tab bar, in the SPLIT anatomy.
 *
 * This is a native UITabBarController on iOS (BottomNavigationView on Android)
 * via expo-router's native tabs, which means Liquid Glass on iOS 26 is
 * INHERITED, not reconstructed: the material, its refraction and adaptive
 * contrast, the selection treatment, the minimize-on-scroll behaviour, the
 * scroll-edge transition, Dynamic Type, Reduce Transparency and double-tap-to-
 * pop-to-root are all the system's, not ours.
 *
 * ANATOMY: the capsule carries the four PLACES from @hybrid/core
 * AURORA_NAV_TABS — Today, Nutrition, Messages, Profile — and TRAIN, the app's
 * one VERB, rides beside it as the DETACHED circle. On iOS 26 that geometry is
 * only reachable through the tab-bar SEARCH role, so the Train trigger takes
 * `role="search"`: the system detaches it into the separated circle and this
 * layout puts the dumbbell and the Train label on it (react-native-screens
 * applies a custom icon/title over a system item). Spending the search slot on
 * the verb is a DELIBERATE trade, recorded in nav-bar.ts — HYBRID has no
 * cross-app search, and the circle never wears a magnifier. On Android and
 * iOS < 26 the trigger degrades to a plain trailing tab, which is correct:
 * those platforms have no detached slot to inherit.
 *
 * THE CIRCLE MORPHS, and it did not used to. The contract has always said the
 * action is contextual (auroraNavAction), and this file used to record that
 * mobile could not honour it — "a native trigger is a ROUTE, not a button" and
 * expo-router's native tabs exposed no way to intercept the press. That second
 * half is no longer true: a trigger now takes `listeners.tabPress`, and a
 * `disabled` trigger still EMITS that press while skipping navigation. Those
 * two together are exactly a button.
 *
 * So the circle is assembled from whatever the visible surface asks for
 * (lib/nav-surface): a `route` action is an ordinary trigger that navigates, a
 * `screen` action is a disabled trigger whose press the surface handles itself.
 * On the add-to-meal picker that is the magnifier — see nav-bar.ts for why a
 * magnifier there does NOT reopen the spent-slot trade — and on the recipes
 * library it is a bare plus that opens the recipe editor, gated by the same
 * free-tier check the shelf's own door row runs. Everywhere else it is the
 * dumbbell, navigating to the Train launcher, exactly as before.
 *
 * Off iOS 26 there is no detached slot, so this degrades to a trailing tab that
 * changes its glyph — which is the right degradation: the verb is still stated,
 * it simply is not separated.
 *
 * THE ACCESSORY IS NOT ALWAYS THERE. The mini-player slot is mounted ONLY
 * while a workout is minimized (a persisted draft exists). It is not enough for
 * the accessory's child to render null: UIKit builds the accessory from the
 * presence of the `<NativeTabs.BottomAccessory>` slot, glass capsule and all,
 * so an empty child still parked an empty bar above the pills on every screen —
 * a mini-player with nothing playing. The slot is therefore gated on the draft
 * itself, which is what the accessory shows anyway.
 *
 * Other native-bar consequences, still deliberate:
 *  - The bar no longer appears on pushed sub-pages (Statistics, Settings,
 *    Periodize, …). A native tab bar is hidden by a stack pushed above it.
 *  - Tab glyphs are SF Symbols, not the Aurora design-kit line icons. Native
 *    tab bars take SF Symbols or image resources, never React components. The
 *    kit PNGs are passed as `src` so Android keeps the house style.
 *  - Every route that is NOT one of these five moved OUT of this directory
 *    into the root stack: a native tab bar renders every route in its folder,
 *    and marking one `hidden` makes it un-navigable (it throws when focused).
 */

// SF Symbols per tab, with the filled variant for the selected state — the
// symbol swap iOS does natively and which the line-icon kit could only ever
// approximate with a colour change. `src` is the Android/fallback image, taken
// from the existing kit PNGs so the house style survives off-iOS.
// Not annotated on purpose: letting the literals flow means TypeScript checks
// every symbol name against expo-router's SF Symbols union, so a typo or a
// symbol that doesn't exist is a build error rather than a blank tab on device
// — which matters when the sandbox can't render the bar to look at it.
const ICONS = {
  today: { sf: { default: "house", selected: "house.fill" }, src: require("../../assets/icons/village.png") },
  // Nutrition has no filled counterpart in SF Symbols (`fork.knife` ships alone;
  // the only .fill variants change the SHAPE by adding a circle, which would
  // read as a different icon on selection). One symbol for both states, and the
  // tint carries the selection — which is what iOS does for symbols without a
  // fill pair. The Android/fallback PNG is the kit's own fork-knife glyph.
  nutrition: { sf: "fork.knife", src: require("../../assets/icons/fork-knife.png") },
  // Messages took the slot the More springboard used to hold — see
  // @hybrid/core nav-bar.ts. The envelope is the platform's DM mark and the
  // kit's own `mail` glyph carries the house style off iOS.
  messages: { sf: { default: "envelope", selected: "envelope.fill" }, src: require("../../assets/icons/mail.png") },
  profile: { sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" }, src: require("../../assets/icons/user-circle.png") },
} as const;

// The detached action's own icon, per action id. The role would default to a
// magnifier and a "Search" title; every one of these overrides it, including
// the picker's — that one is the surface's verb, not the role's search.
const ACTION_ICON = {
  train: { sf: { default: "dumbbell", selected: "dumbbell.fill" }, src: require("../../assets/icons/list-add.png") },
  post: { sf: { default: "square.and.pencil", selected: "square.and.pencil" }, src: require("../../assets/icons/list-add.png") },
  search: { sf: { default: "magnifyingglass", selected: "magnifyingglass" }, src: require("../../assets/icons/search.png") },
  // The recipes library's own verb. A BARE plus — `plus.circle` would draw a
  // ring inside a circle the system already drew, and the kit's own `add` glyph
  // carries the house style off iOS.
  recipe: { sf: { default: "plus", selected: "plus" }, src: require("../../assets/icons/add.png") },
} as const;

// Route name inside this directory, per tab id.
const ROUTE: Record<string, string> = {
  today: "index",
  nutrition: "nutrition",
  messages: "messages",
  profile: "you",
};

export default function TabsLayout() {
  const { session, ready } = useSession();
  const { t } = useLang();
  const { palette } = useTheme();
  // What the visible surface says its verb is. Hooks run before the early
  // returns below — a conditional hook would break the rules of hooks the one
  // time this screen has no session.
  const surface = useNavSurface();
  const action = AURORA_NAV_ACTIONS[auroraNavAction(surface)];
  // A minimized workout, or null. Gates the accessory slot below.
  const draft = useSessionDraft();

  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;

  const label = (key: string, fallback: string) => (t(key) === key ? fallback : t(key));

  return (
    <NativeTabs
      // The brand tint is the ONE piece of styling worth keeping: iOS puts the
      // app's colour on the selected item and leaves the rest to the material.
      // No backgroundColor and no blurEffect override — on iOS 26 that would
      // opt the bar OUT of Liquid Glass and back into a flat fill, which is the
      // exact mistake the old bar made.
      tintColor={palette.lime}
      labelStyle={{ fontFamily: F.semi }}
      // The system minimize-on-scroll, replacing ~150 lines of hand-built
      // collapse ramp, hysteresis and icon-only relayout across both clients.
      minimizeBehavior="onScrollDown"
      // iPad and macOS get the sidebar layout for free.
      sidebarAdaptable
    >
      {/* A workout in progress lives in the system accessory — the mini-player
          slot above the bar. iOS 26+ only; older iOS and Android simply don't
          render it, which is the correct degradation for a system affordance.
          Mounted only while there IS one to show: the slot is the bar, so an
          always-mounted one is an empty bar (see the header). */}
      {draft ? (
        <NativeTabs.BottomAccessory>
          <SessionAccessory />
        </NativeTabs.BottomAccessory>
      ) : null}

      {/* The capsule: Today, Nutrition, Messages, Profile. */}
      {AURORA_NAV_TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.id} name={ROUTE[tab.id]}>
          <NativeTabs.Trigger.Icon sf={ICONS[tab.id]!.sf} src={ICONS[tab.id]!.src} />
          <NativeTabs.Trigger.Label>{label(tab.labelKey, tab.label)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}

      {/* THE ACTION — detached beside the capsule via the search role (the only
          detached geometry iOS 26 offers), wearing the visible surface's verb.
          The route stays `log` in every state: `name` identifies the trigger to
          the navigator, so swapping it per surface would be renaming a route
          under a mounted navigator rather than changing a button. A SCREEN
          action instead marks the trigger `disabled` — which suppresses the
          native navigation while still emitting `tabPress` — and hands the
          press back to the surface that published it. */}
      <NativeTabs.Trigger
        name="log"
        role="search"
        disabled={action.kind === "screen"}
        listeners={{
          tabPress: () => {
            if (action.kind !== "screen") return;
            // If nothing claimed it, do nothing rather than falling through to
            // Train: the circle is showing a magnifier, and sending someone to
            // the gym from a magnifier is worse than a press that misses.
            runNavAction();
          },
        }}
      >
        <NativeTabs.Trigger.Icon sf={ACTION_ICON[action.id].sf} src={ACTION_ICON[action.id].src} />
        <NativeTabs.Trigger.Label>{label(action.labelKey, action.label)}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
