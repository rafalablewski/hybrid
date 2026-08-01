import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AURORA_NAV_TABS } from "@hybrid/core";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import SessionAccessory from "../../components/aurora/session-accessory";

/**
 * THE BOTTOM NAV — the real system tab bar.
 *
 * This is a native UITabBarController on iOS (BottomNavigationView on Android)
 * via expo-router's native tabs, which means Liquid Glass on iOS 26 is
 * INHERITED, not reconstructed: the material, its refraction and adaptive
 * contrast, the selection treatment, the minimize-on-scroll behaviour, the
 * scroll-edge transition, Dynamic Type, Reduce Transparency and double-tap-to-
 * pop-to-root are all the system's, not ours. It replaces the hand-built
 * floating capsule (components/aurora/global-nav.tsx), which was a custom bar
 * wearing the system material — close, but never 1:1.
 *
 * WHAT THIS CHANGED, deliberately, because 1:1 means the platform's rules win:
 *  - The bar no longer appears on pushed sub-pages (Statistics, Settings,
 *    Periodize, …). A native tab bar is hidden by a stack pushed above it; the
 *    old bar was mounted at the ROOT specifically to defeat that. This is the
 *    system behaviour, so it is now ours.
 *  - Tab glyphs are SF Symbols, not the Aurora design-kit line icons. Native
 *    tab bars take SF Symbols or image resources, never React components. The
 *    kit PNGs are passed as `src` so Android keeps the house style.
 *  - Every route that is NOT one of the five tabs moved OUT of this directory
 *    into the root stack: a native tab bar renders every route in its folder,
 *    and marking one `hidden` makes it un-navigable (it throws when focused).
 *
 * The five destinations and their order come from @hybrid/core AURORA_NAV_TABS,
 * the same table the web pill nav reads, so the two clients stay in step on
 * WHAT the bar contains even though only web still controls how it looks.
 *
 * The separated circular slot beside the bar is Apple's SEARCH role
 * (`role="search"` on a trigger) and is deliberately left unused — it is
 * reserved for real cross-app search, never for a training action.
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
  train: { sf: { default: "dumbbell", selected: "dumbbell.fill" }, src: require("../../assets/icons/list-add.png") },
  more: { sf: { default: "square.grid.2x2", selected: "square.grid.2x2.fill" }, src: require("../../assets/icons/grid.png") },
  profile: { sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" }, src: require("../../assets/icons/user-circle.png") },
} as const;

// Route name inside this directory, per tab id.
const ROUTE: Record<string, string> = {
  today: "index",
  nutrition: "nutrition",
  train: "log",
  more: "more",
  profile: "you",
};

export default function TabsLayout() {
  const { session, ready } = useSession();
  const { t } = useLang();
  const { palette } = useTheme();

  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;

  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));

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

      {AURORA_NAV_TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.id} name={ROUTE[tab.id]}>
          <NativeTabs.Trigger.Icon sf={ICONS[tab.id]!.sf} src={ICONS[tab.id]!.src} />
          <NativeTabs.Trigger.Label>{label(tab.id, tab.label)}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
