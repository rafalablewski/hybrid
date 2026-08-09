import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AURORA_NAV_TABS, AURORA_NAV_ACTIONS } from "@hybrid/core";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import SessionAccessory from "../../components/aurora/session-accessory";

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
 * WHAT THE NATIVE BAR CANNOT DO: morph the circle to Add post while Today's
 * Feed hub tab is up, the way the web pill nav does — a native trigger is a
 * ROUTE, not a button, so it cannot swap its action per hub tab. The feed's
 * always-open composer sits at the top of that tab instead; the gap is
 * recorded as nav-action-morph-mobile in capabilities.ts.
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

// The detached action's own icon — the dumbbell, never the search magnifier
// the role would default to.
const TRAIN_ICON = { sf: { default: "dumbbell", selected: "dumbbell.fill" }, src: require("../../assets/icons/list-add.png") } as const;

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
          render it, which is the correct degradation for a system affordance. */}
      <NativeTabs.BottomAccessory>
        <SessionAccessory />
      </NativeTabs.BottomAccessory>

      {/* The capsule: Today, Nutrition, Messages, Profile. */}
      {AURORA_NAV_TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.id} name={ROUTE[tab.id]}>
          <NativeTabs.Trigger.Icon sf={ICONS[tab.id]!.sf} src={ICONS[tab.id]!.src} />
          <NativeTabs.Trigger.Label>{label(tab.labelKey, tab.label)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}

      {/* THE ACTION — Train, detached beside the capsule via the search role
          (the only detached geometry iOS 26 offers), wearing the dumbbell and
          the Train label instead of the role's magnifier. It opens the Train
          launcher: a trigger is a route, exactly what the old Train tab was. */}
      <NativeTabs.Trigger name="log" role="search">
        <NativeTabs.Trigger.Icon sf={TRAIN_ICON.sf} src={TRAIN_ICON.src} />
        <NativeTabs.Trigger.Label>{label(AURORA_NAV_ACTIONS.train.labelKey, AURORA_NAV_ACTIONS.train.label)}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
