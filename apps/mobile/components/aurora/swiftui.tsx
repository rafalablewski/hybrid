import { Platform, View, StyleSheet } from "react-native";
import { Host, Picker, Text as SwiftText, RoundedRectangle } from "@expo/ui/swift-ui";
import { glassEffect, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "../../lib/theme";
import { RADIUS, withAlpha } from "./kit";

/**
 * AURORA × SwiftUI — the native iOS layer of the shared kit.
 *
 * `@expo/ui` renders REAL SwiftUI views (Liquid Glass, segmented Picker, glass
 * Buttons) on iOS. SwiftUI is iOS-only, so the kit reads
 * `LIQUID_GLASS_SUPPORTED` below: on iOS the native treatment is ALWAYS ON —
 * there is no user toggle (the old Settings switch was removed by request; the
 * native look IS the product on iOS). Off-iOS — Android, web (Next.js keeps
 * its CSS Aurora) — the kit falls back to the plain React-Native Aurora
 * treatment. The parity gap is tracked in `capabilities.ts` (`swiftui-kit`).
 * Native rendering needs an EAS/dev build to verify; the JS here is exercised
 * by typecheck + the iOS export bundle.
 *
 * Composition rule: a SwiftUI subtree must live entirely inside a `<Host>`, so
 * we only use SwiftUI for self-contained leaves (segment, button) and for a
 * glass BACKDROP that sits behind ordinary RN content (GlassSurface). RN
 * children are never placed inside a Host.
 */

/** True only where SwiftUI exists — the kit's single gate for the native
 *  treatment. (Liquid Glass itself needs iOS 26+; on older iOS the native
 *  module degrades and the RN floor below stays visible.) */
export const LIQUID_GLASS_SUPPORTED = Platform.OS === "ios";

/**
 * Liquid Glass surface — a native SwiftUI `glassEffect` rounded rectangle that
 * fills its parent, dropped BEHIND ordinary RN card content. A translucent RN
 * floor sits under the glass so the surface is still visible on iOS < 26 (where
 * `glassEffect` is unavailable) and during the brief native mount. Returns null
 * off-iOS — callers keep their solid RN background there.
 */
export function GlassSurface({ radius = RADIUS.card, tintColor }: { radius?: number; tintColor?: string }) {
  const { palette } = useTheme();
  if (!LIQUID_GLASS_SUPPORTED) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      {/* Visible floor for iOS < 26 / pre-mount. Low opacity so the ambient
          field blobs show through and the glass reads as coloured, not grey. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.ink2, 0.28) }]} />
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
