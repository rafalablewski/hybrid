import { type ReactNode, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  RefreshControl,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";

/**
 * AURORA template UI kit (mobile). Soft, rounded primitives adapted from the
 * mobile Figma design — big corner radii, pill buttons, a floating-card feel —
 * but built on the HYBRID brand tokens (lime accent, ink surfaces, Archivo type)
 * via the shared theme palette, so the new look stays on-brand and theme-aware.
 */
export const RADIUS = { card: 28, field: 16, pill: 999 } as const;

/** Ambient soft blobs — a calmer version of the classic GlassField, giving the
 *  rounded screens an airy gradient-like backdrop without a native gradient dep. */
function AuroraField() {
  const { palette } = useTheme();
  const blob = (color: string, style: ViewStyle): ViewStyle => ({
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: color,
    opacity: 0.1,
    ...style,
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <View style={blob(palette.violet, { top: -120, left: -90 })} />
      <View style={blob(palette.lime, { bottom: -140, right: -80 })} />
    </View>
  );
}

export function AuroraScreen({
  children,
  scroll = true,
  center = false,
  padding = 24,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { palette } = useTheme();
  const body = scroll ? (
    <ScrollView
      // Clear the floating Aurora pill nav (icon + label ≈ 96px + safe-area) so
      // the last content row never hides under the bar.
      contentContainerStyle={{ padding, paddingBottom: 132, flexGrow: center ? 1 : undefined, justifyContent: center ? "center" : undefined }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.lime} colors={[palette.lime]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, justifyContent: center ? "center" : "flex-start" }}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <AuroraField />
      {body}
    </SafeAreaView>
  );
}

/** The circular brand mark used across the auth flow (HYBRID dot). */
export function AuroraMark({ size = 64 }: { size?: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: palette.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: F.black, fontSize: size * 0.42, color: palette.chalk }}>
        H<Text style={{ color: txt(palette, palette.lime) }}>.</Text>
      </Text>
    </View>
  );
}

export function ACard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: palette.ink2,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: RADIUS.card,
          padding: 20,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type PillVariant = "primary" | "light" | "soft";

export function APill({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const bg =
    variant === "primary" ? palette.lime : variant === "light" ? palette.chalk : palette.ink2;
  const fg = variant === "soft" ? palette.chalk : palette.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: bg,
          borderRadius: RADIUS.pill,
          paddingVertical: 18,
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
          borderWidth: variant === "soft" ? 1 : 0,
          borderColor: palette.line,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: F.bold, fontSize: 16, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function AField({
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address";
  /** Optional leading icon (e.g. mail/lock); secure fields also show an eye. */
  icon?: AuroraIconName;
}) {
  const { palette } = useTheme();
  // Secure fields start masked; the eye toggles visibility.
  const [visible, setVisible] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: palette.ink2,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: RADIUS.field,
        paddingHorizontal: 18,
        marginBottom: 13,
      }}
    >
      {icon && <AuroraIcon name={icon} size={20} color={palette.ash} />}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.ash}
        secureTextEntry={secure ? !visible : false}
        keyboardType={keyboard ?? "default"}
        autoCapitalize="none"
        style={{ flex: 1, fontFamily: F.reg, fontSize: 15, color: palette.chalk, paddingVertical: 17 }}
      />
      {secure && (
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}>
          <AuroraIcon name="eye" size={20} color={visible ? palette.lime : palette.ash} />
        </Pressable>
      )}
    </View>
  );
}

/** Rounded segmented pill control (e.g. lb/kg, Day/Week/Month). */
export function ASegment<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: palette.ink2,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onPick(o.id)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 11,
              borderRadius: RADIUS.pill,
              backgroundColor: on ? palette.lime : "transparent",
            }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? palette.onAccent : palette.ash }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AHeading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: F.black, fontSize: 30, color: palette.chalk, lineHeight: 36, letterSpacing: -0.5 }, style]}>
      {children}
    </Text>
  );
}

export function ASub({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: F.reg, fontSize: 15, color: palette.ash, lineHeight: 22 }, style]}>
      {children}
    </Text>
  );
}
