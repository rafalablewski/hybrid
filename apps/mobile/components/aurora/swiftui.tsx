import { type ReactNode } from "react";
import { Platform, View, StyleSheet, type ViewStyle } from "react-native";
import { Host, Picker, Button as SwiftButton, Text as SwiftText, RoundedRectangle } from "@expo/ui/swift-ui";
import { glassEffect, pickerStyle, tag, tint, buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "../../lib/theme";
import { useLiquidGlass } from "../../lib/liquid-glass";
import { RADIUS } from "./kit";

/**
 * AURORA × SwiftUI — the native iOS layer of the shared kit.
 *
 * `@expo/ui` renders REAL SwiftUI views (Liquid Glass, segmented Picker, glass
 * Buttons) on iOS. SwiftUI is iOS-only AND it's user-toggleable, so the kit
 * reads `useLiquidGlass().active` (lib/liquid-glass.tsx) = iOS && the Settings
 * switch is on. When that's false — Android, web (Next.js keeps its CSS Aurora),
 * or the user flipped it off — the kit falls back to the plain React-Native
 * Aurora treatment. The parity gap is tracked in `capabilities.ts`
 * (`swiftui-kit`). Native rendering needs an EAS/dev build to verify; the JS
 * here is exercised by typecheck + the iOS export bundle.
 *
 * Composition rule: a SwiftUI subtree must live entirely inside a `<Host>`, so
 * we only use SwiftUI for self-contained leaves (segment, button) and for a
 * glass BACKDROP that sits behind ordinary RN content (GlassSurface). RN
 * children are never placed inside a Host.
 */

/** True only where SwiftUI exists. (Liquid Glass itself needs iOS 26+; on older
 *  iOS the native module degrades and the RN floor below stays visible.) Whether
 *  the kit ACTUALLY renders native depends on the user's runtime toggle too —
 *  see `useLiquidGlass().active` (lib/liquid-glass.tsx), which the kit reads. */
export const LIQUID_GLASS_SUPPORTED = Platform.OS === "ios";

/** Append an alpha byte to a `#RRGGBB` brand token → `#RRGGBBAA`. */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/**
 * Liquid Glass surface — a native SwiftUI `glassEffect` rounded rectangle that
 * fills its parent, dropped BEHIND ordinary RN card content. A translucent RN
 * floor sits under the glass so the surface is still visible on iOS < 26 (where
 * `glassEffect` is unavailable) and during the brief native mount. Returns null
 * off-iOS — callers keep their solid RN background there.
 */
export function GlassSurface({ radius = RADIUS.card, tintColor }: { radius?: number; tintColor?: string }) {
  const { palette } = useTheme();
  const { active } = useLiquidGlass();
  if (!active) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      {/* Visible floor for iOS < 26 / pre-mount. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.ink2, 0.55) }]} />
      <Host style={StyleSheet.absoluteFill} pointerEvents="none">
        <RoundedRectangle
          cornerRadius={radius}
          modifiers={[
            glassEffect({
              glass: { variant: "regular", ...(tintColor ? { tint: tintColor } : {}) },
              shape: "roundedRectangle",
              cornerRadius: radius,
            }),
          ]}
        />
      </Host>
    </View>
  );
}

/**
 * Native segmented control (SwiftUI `Picker` + `.pickerStyle(.segmented)`),
 * tinted with the active accent. Same shape/contract as the kit's RN `ASegment`
 * so kit.tsx can swap it in transparently on iOS.
 */
export function GlassSegment<T extends string>({
  options,
  value,
  onPick,
  accent,
}: {
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  accent?: string;
}) {
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
      <Picker
        selection={value}
        onSelectionChange={(v) => onPick(v as T)}
        modifiers={accent ? [pickerStyle("segmented"), tint(accent)] : [pickerStyle("segmented")]}
      >
        {options.map((o) => (
          <SwiftText key={o.id} modifiers={[tag(o.id)]}>
            {o.label}
          </SwiftText>
        ))}
      </Picker>
    </Host>
  );
}

/**
 * Native Liquid Glass button — content-sized (`matchContents`), so it suits
 * compact / inline actions. The kit's full-width `APill` keeps its RN layout and
 * borrows `GlassSurface` for its glass material instead; this is the opt-in
 * "true" SwiftUI button for places where a self-contained native control fits.
 */
export function GlassButton({
  label,
  onPress,
  prominent = false,
  accent,
  role,
}: {
  label: string;
  onPress: () => void;
  prominent?: boolean;
  accent?: string;
  role?: "default" | "cancel" | "destructive";
}) {
  return (
    <Host matchContents>
      <SwiftButton
        label={label}
        onPress={onPress}
        role={role}
        modifiers={accent ? [buttonStyle(prominent ? "glassProminent" : "glass"), tint(accent)] : [buttonStyle(prominent ? "glassProminent" : "glass")]}
      />
    </Host>
  );
}

/** Convenience wrapper: any RN content rendered on a Liquid Glass surface. Used
 *  by the kit's `ACard` on iOS; exported for screens that build bespoke glass
 *  panels and want the same backdrop + radius behaviour. */
export function GlassPanel({ children, radius = RADIUS.card, style }: { children: ReactNode; radius?: number; style?: ViewStyle }) {
  return (
    <View style={style}>
      <GlassSurface radius={radius} />
      {children}
    </View>
  );
}
