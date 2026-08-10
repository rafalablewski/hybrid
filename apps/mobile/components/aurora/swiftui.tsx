import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Platform, View, StyleSheet } from "react-native";
import {
  Button,
  ContextMenu,
  Divider,
  GlassEffectContainer,
  HStack,
  Host,
  Image as SwiftImage,
  Menu,
  Namespace,
  Picker,
  RNHostView,
  RoundedRectangle,
  Spacer,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  Animation,
  accessibilityLabel,
  animation,
  buttonStyle,
  contentShape,
  font,
  foregroundColor,
  frame,
  glassEffect,
  glassEffectId,
  padding,
  pickerStyle,
  shapes,
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
 * children are never placed inside a Host — with ONE contained, watchdogged
 * exception (`GlassContextMenu` below), which documents why it is allowed.
 */

/** True only where SwiftUI exists — the kit's single gate for the native
 *  treatment. (Liquid Glass itself needs iOS 26+; on older iOS the native
 *  module degrades and the RN floor below stays visible.) */
export const LIQUID_GLASS_SUPPORTED = Platform.OS === "ios";

/** Where the material actually RENDERS — Liquid Glass is an iOS 26 material,
 *  and below 26 `glassEffect` is a no-op: only whatever RN floor sits under it
 *  shows. Surfaces that layer glass over their own floor can ignore the
 *  distinction; a control that hands its WHOLE rendering to SwiftUI (the nav
 *  button) must not, or pre-26 phones would get a bare native button with no
 *  material at all. Those callers gate on this and keep their full RN
 *  treatment below 26. */
export const LIQUID_GLASS_RENDERED =
  LIQUID_GLASS_SUPPORTED && (parseInt(String(Platform.Version), 10) || 0) >= 26;

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
 * THE NAV BUTTON'S NATIVE FORM — a real SwiftUI `Button` wearing real Liquid
 * Glass, interactive: the material itself answers the touch (the specular
 * shimmer, the press bounce), which no RN scale transform over a static
 * backdrop can do. This is a self-contained LEAF per the composition rule
 * above — like `GlassSegment`'s Picker, the tap is handled by SwiftUI, so it
 * mounts ONLY where the material is known to render (`LIQUID_GLASS_RENDERED`);
 * everywhere else the caller keeps its whole RN button, glyph and all.
 *
 * The glyph is the platform's (an SF Symbol): a native control wears native
 * type. `arrow.left` / `chevron.down` are the same drawings as the kit's
 * `back` / `chevron-down` marks, so the RN fallback and the native form read
 * as one control.
 */
export function GlassNavButton({
  onPress,
  label,
  glyph,
  material = "glass",
  size,
  hit,
  glyphSize,
  fg,
}: {
  onPress: () => void;
  /** The full accessibility phrase ("← Olympic Weightlifting", "Back"). */
  label: string;
  glyph: "arrow.left" | "chevron.down";
  /** `clear` keeps the BUTTON but strips the material (glass variant
   *  `identity`), so the field screens' clear↔glass cross-fade changes only
   *  the material — never the renderer, never the glyph. */
  material?: "clear" | "glass";
  /** The visual circle. */
  size: number;
  /** The hit target the circle sits centred in. */
  hit: number;
  glyphSize: number;
  fg: string;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  return (
    <Host style={{ width: hit, height: hit }}>
      <Button onPress={onPress} modifiers={[buttonStyle("plain"), accessibilityLabel(label)]}>
        <SwiftImage
          systemName={glyph}
          size={glyphSize}
          color={fg}
          modifiers={[
            // Chain order is the construction: centre the glyph in the visual
            // circle, glass THAT circle, then pad the frame out to the hit
            // target and make the whole frame tappable.
            frame({ width: size, height: size }),
            glassEffect({
              glass: { variant: material === "glass" ? "regular" : "identity", interactive: true },
              shape: "circle",
            }),
            frame({ width: hit, height: hit }),
            contentShape(shapes.circle()),
          ]}
        />
      </Button>
    </Host>
  );
}

/**
 * THE OVERFLOW MENU'S NATIVE FORM — a SwiftUI `Menu`: tap the glyph and the
 * system presents its own menu, which on iOS 26 is Liquid Glass zoom-morphing
 * out of the anchor. Another self-contained LEAF (trigger and items are one
 * native view; selection is handled by SwiftUI, like `GlassSegment`'s Picker),
 * so it mounts only where the material renders — the RN card fallback keeps
 * every other platform.
 *
 * A system menu DISMISSES on select — it cannot hold a row open to tag it
 * "Followed ✓" the way the RN card did — so callers report outcomes with a
 * toast instead. Rows carry no icons: the RN card and the web twin are
 * label-only, and the mark set must not fork by renderer.
 */
export function GlassMenuButton({
  items,
  onSelect,
  label,
  glyphColor,
  size = 34,
}: {
  items: { key: string; label: string; destructive?: boolean }[];
  onSelect: (key: string) => void;
  /** The trigger's accessibility name ("Post options"). */
  label: string;
  glyphColor: string;
  /** The square hit box the ⋯ sits in. */
  size?: number;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  return (
    <Host style={{ width: size, height: size }}>
      <Menu
        label={
          <SwiftImage
            systemName="ellipsis"
            size={15}
            color={glyphColor}
            modifiers={[frame({ width: size, height: size }), contentShape(shapes.rectangle())]}
          />
        }
        modifiers={[accessibilityLabel(label)]}
      >
        {items.map((it) => (
          <Button key={it.key} label={it.label} role={it.destructive ? "destructive" : "default"} onPress={() => onSelect(it.key)} />
        ))}
      </Menu>
    </Host>
  );
}

/*
 * NOT HERE, ON PURPOSE: a native form for the brand CTA pill (Log set, Finish,
 * APill's primary). The goal is native SwiftUI CONTROLS, not the glass skin —
 * and a full-width chartreuse CTA has no system counterpart: `.glassProminent`
 * would restyle the brand's one "go" surface, not nativize a control. Filled
 * pills stay the app's own drawing on every platform. (A `GlassPillButton`
 * shipped briefly and was reverted on that direction — see capabilities
 * `swiftui-kit`, device round 2.)
 */

/**
 * A SELECT that answers from a MENU — the system Menu with an inline Picker
 * (the radio group with the checkmark), plus optional extra action rows behind
 * a divider (the meal chooser's "Add a meal part"). The TRIGGER is the value
 * itself as text — the app's inline-select idiom ("Breakfast ⌄", "⏱ 90s") —
 * drawn by SwiftUI in the caller's own face so the head reads unchanged.
 */
export function GlassSelectMenu<T extends string>({
  label,
  fontFamily,
  fontSize,
  labelColor,
  a11yLabel,
  options,
  value,
  onPick,
  extras,
  onExtra,
}: {
  /** The trigger's text — usually the selected value's own label. */
  label: string;
  fontFamily: string;
  fontSize: number;
  labelColor: string;
  a11yLabel: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  /** Action rows appended after a divider — things that are not a selection. */
  extras?: { key: string; label: string; destructive?: boolean }[];
  onExtra?: (key: string) => void;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  return (
    <Host matchContents>
      <Menu
        label={
          <HStack spacing={6} modifiers={[contentShape(shapes.rectangle())]}>
            <SwiftText modifiers={[font({ family: fontFamily, size: fontSize }), foregroundColor(labelColor)]}>{label}</SwiftText>
            <SwiftImage systemName="chevron.down" size={Math.round(fontSize * 0.8)} color={labelColor} />
          </HStack>
        }
        modifiers={[accessibilityLabel(a11yLabel)]}
      >
        <Picker selection={value} onSelectionChange={(v) => onPick(v as T)}>
          {options.map((o) => (
            <SwiftText key={o.id} modifiers={[tag(o.id)]}>
              {o.label}
            </SwiftText>
          ))}
        </Picker>
        {extras?.length ? <Divider /> : null}
        {extras?.map((e) => (
          <Button key={e.key} label={e.label} role={e.destructive ? "destructive" : "default"} onPress={() => onExtra?.(e.key)} />
        ))}
      </Menu>
    </Host>
  );
}

/**
 * LONG-PRESS PREVIEW — the system ContextMenu around ordinary RN content, and
 * THE ONE SANCTIONED EXCEPTION to the composition rule above.
 *
 * `ContextMenu.Trigger` requires the pressed content to live inside the native
 * host, so the RN children here ride in an `RNHostView` (RN-inside-SwiftUI).
 * Everywhere else the rule "RN children are never placed inside a Host" stands,
 * because its reason stands: if the native layer fails, whatever it was
 * carrying vanishes — and here that would be CONTENT, not a control. This
 * component is allowed to exist only because it CONTAINS that risk itself:
 *
 *  - a WATCHDOG: the RN child reports its first layout; if none arrives within
 *    the window, the native wrapper is declared dead and the children remount
 *    as plain RN. The failure case costs a beat of blank, never the content.
 *    A false positive merely loses the long-press — also safe.
 *  - the TRIAL SURFACE is one card type (the feed card), per the
 *    capabilities plan (`context-menu-previews`), until an iOS 26 device build
 *    proves the seam — scroll arbitration, nested Hosts, press-through.
 *
 * No custom Preview element: the system's default preview IS the pressed view
 * lifting off the receding screen, which is exactly the treatment wanted.
 */
export function GlassContextMenu({
  items,
  onSelect,
  children,
}: {
  items: { key: string; label: string; destructive?: boolean }[];
  onSelect: (key: string) => void;
  children: ReactNode;
}) {
  const alive = useRef(false);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    if (!LIQUID_GLASS_RENDERED) return;
    const t = setTimeout(() => { if (!alive.current) setDead(true); }, 1200);
    return () => clearTimeout(t);
  }, []);

  if (!LIQUID_GLASS_RENDERED || dead || items.length === 0) return <>{children}</>;
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <View onLayout={() => { alive.current = true; }}>{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {items.map((it) => (
            <Button key={it.key} label={it.label} role={it.destructive ? "destructive" : "default"} onPress={() => onSelect(it.key)} />
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

/**
 * THE WHEEL — SwiftUI `Picker` + `.pickerStyle(.wheel)`: the system's detented
 * spin with its glass selection band, for choosing one value from a short
 * dynamic list (the date filter's months). Selection applies as the wheel
 * settles — the surface behind it updates live, which is the same
 * direct-manipulation contract the sheet's own drag keeps.
 */
export function GlassWheel<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
      <Picker selection={value} onSelectionChange={(v) => onPick(v as T)} modifiers={[pickerStyle("wheel")]}>
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
