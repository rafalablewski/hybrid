import { type ReactNode } from "react";
import { View, Text, TextInput, ActivityIndicator, type ViewStyle } from "react-native";
import { fs, space, F, Card, Mono, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { CtaLabel } from "../aurora/cta-label";

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
    <Card accent={accent} style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk, marginBottom: children ? 6 : 0 }}>{title}</Text>
      {children ? <Mono color={palette.chalk} style={{ lineHeight: 18 }}>{children}</Mono> : null}
    </Card>
  );
}

/** A dismissible inline error (parity with the admin UI's `err` banners). */
export function ErrorNote({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  const { palette } = useTheme();
  if (!error) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms, borderLeftWidth: 3, borderLeftColor: palette.amber, backgroundColor: `${palette.amber}14`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <Mono color={palette.amber} style={{ flex: 1 }}>{error}</Mono>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}><Mono color={palette.ash}>Dismiss</Mono></Pressable>
      ) : null}
    </View>
  );
}

/** A label/value stat tile (Overview/Financials/HQ). */
export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  const { palette } = useTheme();
  return (
    <Card>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: palette.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: color ? txt(palette, color) : palette.chalk, marginTop: 4 }}>{value}</Text>
      {sub ? <Mono color={palette.ash} style={{ marginTop: 2 }}>{sub}</Mono> : null}
    </Card>
  );
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
export function PillBtn({
  label,
  onPress,
  color,
  outline,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  outline?: boolean;
  disabled?: boolean;
  /** Show a live spinner beside the label — an in-flight action reads as active
   *  rather than stalled (e.g. the "Deleting…" button). */
  busy?: boolean;
}) {
  const { palette } = useTheme();
  const c = color ?? palette.lime;
  const fg = outline ? txt(palette, c) : palette.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: outline ? "transparent" : c,
        borderWidth: 1,
        borderColor: c,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 16,
        opacity: disabled ? 0.5 : 1,
        alignSelf: "flex-start",
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <CtaLabel label={label} color={fg} fontSize={fs.caption} />
    </Pressable>
  );
}

/** A horizontal segmented control (tabs / filters). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: 12 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              borderWidth: 1,
              borderColor: on ? palette.amber : palette.line,
              backgroundColor: on ? `${palette.amber}1c` : "transparent",
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 13,
            }}
          >
            <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(palette, palette.amber) : palette.ash }}>{o.label}</Text>
          </Pressable>
        );
      })}
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
