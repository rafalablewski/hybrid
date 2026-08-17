import { type ReactNode } from "react";
import { View, Text, TextInput, ActivityIndicator, type ViewStyle } from "react-native";
import { fs, space, F, Mono, PressScale, PressScale as Pressable, HIT_TARGET } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { CtaLabel } from "../aurora/cta-label";
import { ACard, AStat, cardStack, RADIUS, AChip } from "../aurora/kit";
import { withAlpha } from "../aurora/field";
import { ALPHA } from "@hybrid/core";

// Shared building blocks for the mobile admin section screens, so all 19 sections
// share one look (matching the web console's lib/ui primitives). Section bodies
// import these instead of re-deriving styles.

/** A short intro line under a section header (mirrors the web `Mono` blurbs). */
export function Intro({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <Mono color={palette.ash} style={{ marginBottom: 16, lineHeight: 18 }}>{children}</Mono>;
}

/** The amber "table not migrated yet" / "couldn't load" banner used across the
 *  CMS-style sections (parity with the web `unavailable` cards). */
export function Banner({ tone = "amber", title, children }: { tone?: "amber" | "red"; title: string; children?: ReactNode }) {
  const { palette } = useTheme();
  const accent = tone === "red" ? palette.red : palette.amber;
  return (
    <ACard accent={accent} style={[cardStack, { marginBottom: 16 }]}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk, marginBottom: children ? 6 : 0 }}>{title}</Text>
      {children ? <Mono color={palette.chalk} style={{ lineHeight: 18 }}>{children}</Mono> : null}
    </ACard>
  );
}

/** A dismissible inline error (parity with the admin UI's `err` banners). */
export function ErrorNote({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  const { palette } = useTheme();
  if (!error) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms, borderLeftWidth: 3, borderLeftColor: palette.amber, backgroundColor: withAlpha(palette.amber, ALPHA.wash), borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <Mono color={palette.amber} style={{ flex: 1 }}>{error}</Mono>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}><Mono color={palette.ash}>Dismiss</Mono></Pressable>
      ) : null}
    </View>
  );
}

/**
 * A label/value stat tile (Overview/HQ) — the kit's `AStat`, kept
 * behind this name so the thirty-six admin call sites read as they always did.
 *
 * It used to draw its own: the same anatomy at `fs.display` with an ash sub,
 * which is how mobile ended up with a stat tile per neighbourhood while web had
 * one for all thirty-one of its screens. Delegating means these figures ROLL
 * like web's — and a financial dashboard is exactly where a number changing
 * under you should be seen to change — and the sub-line picks up the shared
 * sign rule, which is what these panels were already leaning on when they
 * prefix a failing threshold with a minus ("−below 40").
 */
export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return <AStat label={label} value={value} sub={sub} c={color} style={cardStack} />;
}

/** A labeled single-line/multiline text input. */
export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "email-address";
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      {label ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.ash}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          fontFamily: F.mono,
          fontSize: fs.bodyLg,
          color: palette.chalk,
          backgroundColor: palette.ink2,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

/** A compact action button (smaller than lib/ui Button — for inline row actions). */
/**
 * The COMPACT action button — the operator console's dense row action.
 *
 * A deliberate second size class, not a duplicate of the kit's APill: an admin
 * table row cannot carry a 16dp-padded primary pill on every line. What it was
 * NOT allowed to be is untappable — at 7dp of vertical padding around caption
 * type it measured ~29dp, well under the HIG minimum, across 66 call sites. The
 * visual size is unchanged; `minHeight` grows the TARGET to 44 while the fill
 * stays compact, and PressScale gives it the app's one press feedback.
 *
 * The full merge into APill (as `size="compact"`) is tracked in capabilities as
 * `admin-kit-merge` — it is a 66-site restyle of the console and wants a device
 * to verify, not a blind sweep.
 */
export function PillBtn({
  label,
  onPress,
  color,
  outline,
  disabled,
  busy,
  busyLabel,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  outline?: boolean;
  disabled?: boolean;
  /** Show a live spinner beside the label — an in-flight action reads as active
   *  rather than stalled (e.g. the "Deleting…" button). */
  busy?: boolean;
  /** The in-flight WORD. Pass it here rather than swapping `label`: the idle
   *  label keeps its place (invisibly) so the pill cannot change width under a
   *  finger that is still on it. Same contract as the kit's APill `state`. */
  busyLabel?: string;
}) {
  const { palette } = useTheme();
  const c = color ?? palette.lime;
  const fg = outline ? txt(palette, c) : palette.onAccent;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        backgroundColor: outline ? "transparent" : c,
        borderWidth: 1,
        borderColor: c,
        borderRadius: RADIUS.pill,
        paddingVertical: 7,
        paddingHorizontal: 16,
        // The drawing stays compact; the TARGET clears the HIG minimum.
        minHeight: HIT_TARGET,
        opacity: disabled ? 0.5 : 1,
        alignSelf: "flex-start",
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      {/* The idle label always holds the width; the busy word sits over it. */}
      <View>
        <View style={{ opacity: busy && busyLabel ? 0 : 1 }}>
          <CtaLabel label={label} color={fg} fontSize={fs.caption} />
        </View>
        {busy && busyLabel ? (
          <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
            <CtaLabel label={busyLabel} color={fg} fontSize={fs.caption} />
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

/**
 * A wrapping FILTER GROUP — named "Segmented" for years, and it never was one.
 *
 * A segmented control is equal-width and lives in a track; this is a
 * `flexWrap` row of independent pills, which is a chip filter group. Reading it
 * for the consolidation is what settled the count: of the eight "segmented
 * controls" the audit found, this and History's ViewSwitcher were chip rails,
 * so they belong to AChip rather than to ASegment. The name went with the
 * misconception.
 *
 * Kept as a thin wrapper rather than inlined at 24 call sites: the admin's
 * filter rows share a layout (wrap + gap + bottom margin) that is worth naming
 * once.
 */
export function FilterGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}>
      {options.map((o) => (
        <AChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/**
 * A chart legend swatch + label — for the admin panels that draw their series
 * as meter rows rather than as a chart (Overview's growth block, the athlete-
 * weeks ledger). Lives here because it was already drawn twice, and a legend
 * whose dot size differs between two panels of the same console is exactly the
 * drift the shared kit exists to stop. The swatch is SEMANTIC (it identifies a
 * series), which is why the no-decorative-marker rule does not reach it.
 */
export function Legend({ color, label }: { color: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: RADIUS.pill, backgroundColor: color }} />
      <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{label}</Mono>
    </View>
  );
}

/** A simple key/value row for detail lists. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: palette.line }}>
      <Mono color={palette.ash}>{k}</Mono>
      <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.chalk, flexShrink: 1, textAlign: "right" }}>{v}</Text>
    </View>
  );
}
