import { useId } from "react";
import { Platform, View, StyleSheet } from "react-native";
import {
  GlassEffectContainer,
  HStack,
  Host,
  Namespace,
  Picker,
  RoundedRectangle,
  Spacer,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  frame,
  glassEffect,
  glassEffectId,
  padding,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { Spring } from "@hybrid/core";
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
 * LIQUID GLASS PILL ROW — a leading-anchored row of glass capsules that MORPH.
 *
 * This is the one place in the app that uses Liquid Glass as a *behaviour*
 * rather than as a material. Inside a `GlassEffectContainer`, capsules tagged
 * with a `glassEffectId` in a shared `Namespace` are not independent surfaces:
 * when they come within the container's `spacing` of each other the system
 * FUSES them into one lozenge, and when their frames change it flows the glass
 * between the old shape and the new — the specular rim travelling, the
 * refraction re-sampling, a droplet stretching and pinching off. None of that
 * can be approximated by a blur behind an animated view, which is what this
 * replaced: a row of static glass tiles whose widths were tweened in JS.
 *
 * It draws ONLY the glass. The marks and the words stay in React Native on top
 * (the app's own vector glyphs and type, so the detached row and the in-flow
 * switcher can't draw the same three marks two ways), and taps stay on the RN
 * layer too — this Host is `pointerEvents="none"`, so if the native layer never
 * renders, the dock is a plain RN row and still works.
 *
 * The two layers stay locked together because they are handed the same
 * geometry (`hubPillWidths`) and the same PHYSICS: `spring` here goes straight
 * into SwiftUI's `.spring(response:dampingFraction:)`, and the RN side runs the
 * same token through `springToRN`. Both solve one differential equation, so the
 * glyph cannot drift off the capsule it is riding.
 *
 * Every animatable value arrives as a plain number and SwiftUI animates ITSELF
 * to it — nothing is driven frame-by-frame over the bridge, which is what made
 * the earlier JS-driven glass jank (it re-sampled its backdrop every frame).
 */
export function GlassPillRow({
  widths,
  activeIndex,
  gap,
  open,
  height,
  tintColor,
  spring,
  splitSpring,
}: {
  /** Each pill's target width, in order. See `hubPillWidths` in core. */
  widths: number[];
  /** Which pill wears the accent tint, and what the exchange is keyed to. */
  activeIndex: number;
  /** The RESTING space between pills — constant, because it is also the
   *  container's blend distance: two capsules fuse as they come within it and
   *  pinch apart as they pass it, so animating it would move the very
   *  threshold the split is crossing. */
  gap: number;
  /** Whether the row is split. Closed, the pills touch — and touching Liquid
   *  Glass is ONE lozenge, which is the whole point: `open` toggling is SPLIT
   *  and MERGE. */
  open: boolean;
  height: number;
  /** The accent, carried IN the material as a glass tint rather than as a film
   *  laid over it — a tinted pane, not a coloured sheet behind glass. */
  tintColor?: string;
  /** EXCHANGE — the selected pill inflating to its word. */
  spring: Spring;
  /** SPLIT / MERGE — the gap opening and closing. */
  splitSpring: Spring;
}) {
  // One namespace per mounted row: the ids only have to be unique within it.
  const ns = useId();
  if (!LIQUID_GLASS_SUPPORTED) return null;
  const radius = height / 2;
  const lead = open ? gap : 0;
  const swiftSpring = Animation.spring({ response: spring.response, dampingFraction: spring.dampingFraction });
  const swiftSplit = Animation.spring({ response: splitSpring.response, dampingFraction: splitSpring.dampingFraction });
  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <Namespace id={ns}>
        {/* `spacing` is how close two capsules must be to start blending, and
            it is the row's own resting gap: split, the pills sit right at the
            threshold, so shutting the gap carries them through it and they
            fuse — and opening it pinches them apart again. Constant, because
            animating the threshold as well as the distance would mean the
            split never cleanly crosses anything. */}
        <GlassEffectContainer spacing={gap}>
          <HStack spacing={0}>
            {widths.map((w, i) => (
              <RoundedRectangle
                key={i}
                cornerRadius={radius}
                modifiers={[
                  // Order is the SwiftUI modifier chain, and it matters: size
                  // the shape, glass THAT, tag the glass so the container can
                  // flow it, then hold the gap outside the capsule so the
                  // leading pill still starts on the content column.
                  frame({ width: w, height }),
                  glassEffect({
                    glass: { variant: "regular", ...(i === activeIndex && tintColor ? { tint: tintColor } : {}) },
                    shape: "roundedRectangle",
                    cornerRadius: radius,
                  }),
                  glassEffectId(`hub-pill-${i}`, ns),
                  padding({ leading: i === 0 ? 0 : lead }),
                  // Two watched values, two springs: a selection exchanges
                  // widths, an arrival opens the gap, and they are not the same
                  // motion. A change SwiftUI cannot attribute to either — the
                  // first width landing after the labels measure — snaps, which
                  // is what it should do.
                  animation(swiftSpring, activeIndex),
                  animation(swiftSplit, open),
                ]}
              />
            ))}
            {/* LEADING-anchored: the pills sit where the in-flow switcher's own
                left edge was, so detaching reads as the control lifting
                straight up rather than sliding sideways. */}
            <Spacer />
          </HStack>
        </GlassEffectContainer>
      </Namespace>
    </Host>
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
