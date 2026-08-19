import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Platform, View, StyleSheet } from "react-native";
import {
  Button,
  ContextMenu,
  DatePicker,
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
  Stepper,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  contentShape,
  datePickerStyle,
  font,
  foregroundColor,
  frame,
  glassEffect,
  glassEffectId,
  lineLimit,
  minimumScaleFactor,
  padding,
  pickerStyle,
  shapes,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "../../lib/theme";
import { nativeFace } from "../../lib/ui";
import { RADIUS, withAlpha } from "./kit";
import { ALPHA, SATELLITE } from "@hybrid/core";

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
 * TYPE RULE: every `font({ family })` in this file passes the family through
 * `nativeFace()`. Callers keep handing these components `F.bold` / `F.mono`
 * like any RN `<Text>`; the translation to the name Core Text knows
 * ("Archivo-Bold") happens HERE, once, because SwiftUI does not go through the
 * `UIFont.fontNames(forFamilyName:)` swizzle that makes expo-font's aliases
 * work — and an unresolvable name in `Font.custom` silently draws San
 * Francisco. `lib/ui.tsx` carries the map and the full story;
 * `lib/native-face.test.ts` fails the build if a new leaf here passes a family
 * straight through.
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

/** An SF Symbol name, taken from the native Image's own prop rather than from
 *  `sf-symbols-typescript` directly — that package is @expo/ui's dependency,
 *  not ours, and deriving the union keeps the two in step through an SDK bump
 *  without adding a package the Expo alignment test would have to police. */
export type SFSymbol = NonNullable<ComponentProps<typeof SwiftImage>["systemName"]>;

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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.ink2, ALPHA.edge) }]} />
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
 * above — like `GlassSelectMenu`'s Menu, the tap is handled by SwiftUI, so it
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
  /**
   * An SF Symbol. Was the back button's own two names; widened to the union
   * `GlassSatellite` in this file already takes, so the rail's TRAILING control
   * (share) is the same native circle as the leading one rather than a second
   * glass button drawn beside it. Still the typed union, not a string: a symbol
   * that does not exist stays a build error rather than a blank circle on a
   * device this sandbox cannot render.
   */
  glyph: SFSymbol;
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
 * native view; selection is handled by SwiftUI, like `GlassWheel`'s Picker),
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
  glyph = "ellipsis",
  glyphSize = 15,
  circle,
}: {
  items: { key: string; label: string; destructive?: boolean }[];
  onSelect: (key: string) => void;
  /** The trigger's accessibility name ("Post options"). */
  label: string;
  glyphColor: string;
  /** The square hit box the ⋯ sits in. */
  size?: number;
  /** The trigger's symbol. `ellipsis` is the row overflow; the rail's share
   *  control passes its own. */
  glyph?: SFSymbol;
  glyphSize?: number;
  /**
   * Present → the trigger is a GLASSED CIRCLE of this diameter inside the
   * `size` hit box, i.e. the nav button's construction with a Menu behind it
   * instead of a Button. Absent → the bare glyph the feed's ⋯ has always been.
   *
   * The two are one component on purpose: a rail control that mounted its own
   * `Menu` would be a second owner of this leaf, and a glass circle nobody
   * shares is exactly how the logger grew a 34pt nav circle that agreed with
   * nothing (see the native-leaf rule in lib/design-tokens.test.ts).
   */
  circle?: number;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  return (
    <Host style={{ width: size, height: size }}>
      <Menu
        label={
          <SwiftImage
            systemName={glyph}
            size={glyphSize}
            color={glyphColor}
            modifiers={
              circle
                ? [
                    // Same chain as GlassNavButton: centre the glyph in the
                    // visual circle, glass THAT circle, then pad out to the hit
                    // target and make the whole frame tappable.
                    frame({ width: circle, height: circle }),
                    glassEffect({ glass: { variant: "regular", interactive: true }, shape: "circle" }),
                    frame({ width: size, height: size }),
                    contentShape(shapes.circle()),
                  ]
                : [frame({ width: size, height: size }), contentShape(shapes.rectangle())]
            }
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
 * NOT HERE, ON PURPOSE: a native form for the brand CTA pill (Log set, the
 * primary `APill`). The goal is native SwiftUI CONTROLS, not the glass skin —
 * and a full-width chartreuse CTA has no system counterpart: `.glassProminent`
 * would restyle the brand's one "go" surface, not nativize a control. Filled
 * pills stay the app's own drawing on every platform. (A `GlassPillButton`
 * shipped briefly and was reverted on that direction — see capabilities
 * `swiftui-kit`, device round 2.)
 *
 * The line moves the moment a control stops wearing brand paint, which is
 * exactly what happened to Finish: off the chartreuse fill and onto the glass,
 * it is a neutral control with nothing brand-shaped left in it. See
 * `GlassSatellite` below.
 */

/** SwiftUI's `.infinity`, in an API that takes numbers: @expo/ui's `frame`
 *  modifier has no infinity, so "fill whatever you are proposed" is a bound no
 *  phone can reach. The Host is RN-sized when this is used, so the proposal is
 *  the row's own width and the capsule stops there. */
const FILL_WIDTH = 10_000;

/**
 * A SATELLITE — a neutral glass button that orbits a filled primary, as a
 * circle when its glyph speaks for itself (`pause.fill`) and as a labelled
 * capsule when it must not be guessed at.
 *
 * This is NOT the reverted `GlassPillButton`: that revert protected the brand's
 * one "go" surface, and a satellite is the opposite of that surface — it is
 * precisely the neutral control `.glass` exists for, the same call the kit
 * already makes for the `soft` `APill`. Interactive glass matters most here,
 * on the two controls a chalked hand hits without looking: the material itself
 * answers the press.
 *
 * Construction is `GlassNavButton`'s, with the shape opened up — size the
 * content, glass THAT shape, then make the whole frame tappable. Like every
 * leaf in this file it mounts only where the material renders; the caller
 * keeps its whole RN drawing everywhere else.
 */
export function GlassSatellite({
  onPress,
  label,
  glyph,
  word,
  fill,
  fontFamily,
  fontSize = 15,
  fg,
  size = 44,
  glyphSize = 16,
}: {
  onPress: () => void;
  /** The full accessibility phrase — the only name a bare circle has. */
  label: string;
  /** An SF Symbol: `pause.fill`, `play.fill`, `flag.checkered`. */
  glyph: SFSymbol;
  /** Present → a labelled capsule. Absent → a circle. */
  word?: string;
  /**
   * A capsule that takes its width from RN instead of from its own content.
   *
   * This is the round-4 clause honoured rather than dodged: `matchContents`
   * measures the SwiftUI content ONCE, at mount, and a capsule whose word
   * arrives from the language preference (read off disk after the first frame)
   * would hand its layout to a measurement taken before the word existed. With
   * `fill` the Host carries an RN size — the row's own remaining width — and
   * SwiftUI lays out INSIDE the proposal, so the drawn frame is the layout
   * frame by construction. The word then behaves like the RN capsule's: one
   * line, shrinking rather than overflowing, which a 32-character Polish label
   * beside two 44pt circles genuinely needs.
   */
  fill?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fg: string;
  /** The circle's diameter, and the capsule's height. */
  size?: number;
  glyphSize?: number;
}) {
  if (!LIQUID_GLASS_RENDERED) return null;
  const capsule = !!word;
  const wide = capsule && !!fill;
  return (
    <Host
      // A wide capsule is sized by RN (`flex: 1` on the caller's row) and the
      // Host hands that width to SwiftUI as the proposal; only a
      // content-sized capsule asks the native side to measure itself.
      matchContents={capsule && !wide ? true : undefined}
      style={wide ? { flex: 1, height: size } : capsule ? undefined : { width: size, height: size }}
    >
      <Button onPress={onPress} modifiers={[buttonStyle("plain"), accessibilityLabel(label)]}>
        <HStack
          spacing={7}
          modifiers={[
            // Chain order is the construction, exactly as in GlassNavButton:
            // size the content, glass THAT shape, then make the whole frame
            // tappable. A circle sizes both axes; a capsule sizes its height
            // and lets the word decide the width — unless it FILLS, where the
            // proposal decides and the word gives way instead.
            capsule ? padding({ horizontal: 17 }) : padding({ all: 0 }),
            wide
              ? frame({ maxWidth: FILL_WIDTH, height: size })
              : capsule
                ? frame({ height: size })
                : frame({ width: size, height: size }),
            glassEffect({
              glass: { variant: "regular", interactive: true },
              shape: capsule ? "capsule" : "circle",
            }),
            contentShape(capsule ? shapes.capsule() : shapes.circle()),
          ]}
        >
          <SwiftImage systemName={glyph} size={glyphSize} color={fg} />
          {/* `nativeFace` because SwiftUI resolves through Core Text, which does
              not know expo-font's aliases (see lib/ui.tsx). No family → the
              SYSTEM face at that size, STATED: `Font.custom("")` is an
              unresolvable name, which lands on the system face anyway and loses
              the fact that it was asked for. */}
          {word ? (
            <SwiftText
              modifiers={[
                fontFamily ? font({ family: nativeFace(fontFamily), size: fontSize }) : font({ size: fontSize }),
                foregroundColor(fg),
                // The RN capsule's `numberOfLines={1} adjustsFontSizeToFit`,
                // said in SwiftUI, off the same core figure. Only a filled
                // capsule can run out of room; a content-sized one makes its own.
                ...(wide ? [lineLimit(1), minimumScaleFactor(SATELLITE.wordMinScale)] : []),
              ]}
            >
              {word}
            </SwiftText>
          ) : null}
        </HStack>
      </Button>
    </Host>
  );
}

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
            <SwiftText modifiers={[font({ family: nativeFace(fontFamily), size: fontSize }), foregroundColor(labelColor)]}>{label}</SwiftText>
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
 * THE TOOLBAR CAPSULE — two native leaves sharing ONE lozenge of glass, which
 * is what the `⋯` in Apple Music actually is: not a glyph with a circle drawn
 * round it, but a real button inside a `GlassEffectContainer` next to the
 * button it belongs with.
 *
 * The pieces already existed separately and drifted apart: `GlassMenuButton`
 * drew a menu and `GlassSelectMenu` drew a picker trigger. This is those joined
 * up, and it is a stricter reading of the composition rule than what it
 * replaces: today the logger's timer chip and its `⋯` are two separate `Host`s
 * standing next to each other pretending to be a group. (The now-deleted
 * `GlassPillRow`, the Today dock's fusing capsules, knew the same trick but
 * only as decoration — `pointerEvents="none"` with React Native taking the
 * taps.)
 *
 * The LEFT slot is a toggle you flip in the moment (the rest timer: armed or
 * not, counting when it counts). The RIGHT slot is the menu holding everything
 * that must not be one tap — including the toggle's own value, as an inline
 * picker, because a duration is a preference and a preference belongs one
 * level in.
 */
export function GlassToolbarGroup<T extends string>({
  toggleGlyph,
  toggleReadout,
  toggleColor,
  toggleLabel,
  onToggle,
  menuLabel,
  options,
  value,
  onPick,
  actions,
  onAction,
  glyphColor,
  fontFamily,
  height = 34,
}: {
  /** An SF Symbol for the left slot — `timer` / `timer.slash`. */
  toggleGlyph: SFSymbol;
  /** The value read out beside the glyph while it is on (a duration, a
   *  countdown). Absent when off — the mark alone carries the state. */
  toggleReadout?: string;
  toggleColor: string;
  toggleLabel: string;
  onToggle: () => void;
  /** The `⋯`'s accessibility name. */
  menuLabel: string;
  /** The inline picker — the toggle's own value, one level in. */
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  /** Rows after the divider: things that are not a selection. */
  actions?: { key: string; label: string; destructive?: boolean }[];
  onAction?: (key: string) => void;
  glyphColor: string;
  fontFamily: string;
  height?: number;
}) {
  const ns = useId();
  if (!LIQUID_GLASS_RENDERED) return null;
  const radius = height / 2;
  return (
    <Host matchContents>
      <Namespace id={ns}>
        {/* `spacing` is the blend distance: at 2pt the two capsules are inside
            each other's threshold, so the system fuses them into one lozenge
            and flows the glass between them as either changes width — which is
            what the readout appearing and disappearing does. */}
        <GlassEffectContainer spacing={2}>
          <HStack spacing={2}>
            <Button onPress={onToggle} modifiers={[buttonStyle("plain"), accessibilityLabel(toggleLabel)]}>
              <HStack
                spacing={5}
                modifiers={[
                  padding({ horizontal: 11 }),
                  frame({ height }),
                  glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
                  glassEffectId(`toolbar-toggle`, ns),
                  contentShape(shapes.capsule()),
                ]}
              >
                <SwiftImage systemName={toggleGlyph} size={14} color={toggleColor} />
                {toggleReadout ? (
                  <SwiftText modifiers={[font({ family: nativeFace(fontFamily), size: 11 }), foregroundColor(toggleColor)]}>{toggleReadout}</SwiftText>
                ) : null}
              </HStack>
            </Button>

            <Menu
              label={
                <SwiftImage
                  systemName="ellipsis"
                  size={15}
                  color={glyphColor}
                  modifiers={[
                    padding({ horizontal: 11 }),
                    frame({ height }),
                    glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
                    glassEffectId(`toolbar-menu`, ns),
                    contentShape(shapes.capsule()),
                  ]}
                />
              }
              modifiers={[accessibilityLabel(menuLabel)]}
            >
              <Picker selection={value} onSelectionChange={(v) => onPick(v as T)}>
                {options.map((o) => (
                  <SwiftText key={o.id} modifiers={[tag(o.id)]}>
                    {o.label}
                  </SwiftText>
                ))}
              </Picker>
              {actions?.length ? <Divider /> : null}
              {actions?.map((a) => (
                <Button key={a.key} label={a.label} role={a.destructive ? "destructive" : "default"} onPress={() => onAction?.(a.key)} />
              ))}
            </Menu>
          </HStack>
        </GlassEffectContainer>
      </Namespace>
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
 * THE DATE FIELD — SwiftUI `DatePicker` in its compact form: the value reads as
 * a tinted token, and tapping it presents the system's own calendar popover.
 *
 * This one is a LEAF WITH A JOB, not a skin. The sport log used to stamp
 * `new Date()` at save time and nothing else, so a match played on Saturday
 * could only ever be recorded as having happened at the moment you typed it —
 * which is why the done floor hid its log row on every day but today. There was
 * no date to disagree about, so there was nothing to offer. The field is what
 * makes a past day loggable at all.
 *
 * A system date control is exactly where native styling is CORRECT: a calendar
 * popover is the platform's, everyone already knows how to drive it, and it is
 * the one control an app has nothing to add to. (Contrast
 * `ContentUnavailableView`, which is a fine grammar but styles its own type —
 * SF Pro in the middle of a card set in Archivo. That one we follow rather than
 * mount; see `aurora/empty-day.tsx`.)
 *
 * Off-iOS the caller keeps its own field: this returns null, like every leaf
 * here.
 */
export function NativeDateField({
  value,
  onChange,
  earliest,
  latest,
  label,
  tintColor,
  withTime = true,
}: {
  value: Date;
  onChange: (d: Date) => void;
  /** Clamp — a logbook cannot hold a session from the future. */
  earliest?: Date;
  latest?: Date;
  /** The accessible name; the trigger itself shows only the value. */
  label: string;
  tintColor?: string;
  /** Include the clock. A sport that happened has a time of day; a plan does not. */
  withTime?: boolean;
}) {
  if (!LIQUID_GLASS_SUPPORTED) return null;
  return (
    <Host matchContents>
      <DatePicker
        title=""
        selection={value}
        onDateChange={onChange}
        displayedComponents={withTime ? ["date", "hourAndMinute"] : ["date"]}
        {...(earliest || latest ? { range: { start: earliest, end: latest } } : {})}
        modifiers={[
          datePickerStyle("compact"),
          accessibilityLabel(label),
          ...(tintColor ? [tint(tintColor)] : []),
        ]}
      />
    </Host>
  );
}

/**
 * THE STEPPER — SwiftUI `Stepper`, for a duration you nudge rather than type.
 *
 * The sport log asks for minutes through a numeric keyboard, which is three
 * taps and a dismiss for a value that is almost always a round number near the
 * last one. A stepper is the system's answer and it holds its own repeat-on-hold
 * behaviour, its own disabled ends at `min`/`max`, and its own VoiceOver
 * adjustable trait — none of which a pair of hand-drawn ± buttons gets.
 *
 * The label is drawn by SwiftUI in the caller's own face so the row still reads
 * as the app's, the same trick `GlassSatellite` uses for its word.
 */
export function NativeStepper({
  label,
  value,
  onChange,
  step = 5,
  min = 0,
  max = 600,
  fontFamily,
  fontSize = 15,
  fg,
  tintColor,
}: {
  /** The value as the row should read it ("90 min"), not a bare number. */
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  fontFamily?: string;
  fontSize?: number;
  fg?: string;
  tintColor?: string;
}) {
  if (!LIQUID_GLASS_SUPPORTED) return null;
  return (
    <Host matchContents>
      <Stepper
        label={label}
        value={value}
        step={step}
        min={min}
        max={max}
        onValueChange={onChange}
        modifiers={[
          ...(fontFamily ? [font({ family: nativeFace(fontFamily), size: fontSize })] : []),
          ...(fg ? [foregroundColor(fg)] : []),
          ...(tintColor ? [tint(tintColor)] : []),
        ]}
      />
    </Host>
  );
}

/* ── `GlassSegment` IS GONE — DO NOT BRING IT BACK ──────────────────────────
 *
 * It was a SwiftUI `Picker` + `.pickerStyle(.segmented)` inside
 * `<Host matchContents={{ vertical: true }}>`, and on device it did not lay
 * out. `matchContents` sizes the RN host view from the SwiftUI content's
 * layout ONCE, at mount (the prop's own documented limit) — but every segmented
 * control in this app mounts before it knows its content: the labels are
 * translated asynchronously by `useLang`, the segment list is derived from the
 * session history (the date filter's months), and the Today hub REMOUNTS on
 * every selection because the tab swaps the whole screen tree.
 *
 * The result on device was that THE DRAWN FRAME NEVER TRACKED THE LAYOUT FRAME
 * — and it missed DIFFERENTLY at each call site, which is what makes this
 * structural rather than a spacing bug. On Today the box reserved its ~60pt
 * under the profile header and the control painted some 70pt BELOW it, on the
 * date line and the title ("Tuesday, 11 August"). On the This-week card the row
 * took its height from the month trigger beside the track instead — ~38pt — and
 * the control painted 28pt tall ABOVE the row's centre, crossing into the head,
 * with the trigger stranded at the bottom of a row it no longer shared a height
 * with. One component, two call sites, two unrelated misses.
 *
 * That is not a styling defect to tune, and chasing the exact native offset
 * would be answering the wrong question: a control whose height in Yoga is
 * decided by a native measurement taken once, before the content exists, has no
 * reason to agree with the screen around it in the first place. So the RN
 * control — `aurora/liquid-seg.tsx`, laid out entirely
 * by Yoga — is now the ONLY segmented control on every platform. It was never
 * the poor relation: it carries the same inflate-scrub-fly interaction, plus
 * the two things the system Picker structurally cannot do —
 * `intercept` (a segment that opens a sheet instead of taking the selection,
 * which the date filter's Month needs, since a segmented Picker only reports a
 * selection that CHANGED and a re-tap on the segment already in force is
 * silently dropped), and `flightKey` (the pill stays in the air across the
 * hub's remount).
 *
 * The other native leaves here are unaffected and stay: they either size
 * themselves against content they already have (`NativeStepper`,
 * `NativeDateField`, `GlassSelectMenu`), or sit inside a sheet that gives them
 * a height (`GlassWheel`).
 * ───────────────────────────────────────────────────────────────────────── */
