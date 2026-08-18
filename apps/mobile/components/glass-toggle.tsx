import { Switch } from "react-native";
import { useTheme } from "../lib/theme";
import { STATE_OPACITY } from "@hybrid/core";

/** The ONE HYBRID toggle — the native switch (iOS renders it as Liquid Glass)
 *  tinted with the brand lime track + chalk thumb. This is the "golden standard"
 *  first shipped on Logger settings; every on/off control across settings
 *  (Logger, Notifications, Privacy, coach prefs) routes through here so toggles
 *  look and behave identically app-wide. Web has no native switch equivalent —
 *  it keeps its pill toggle (native-only Liquid Glass constraint). */
export function GlassToggle({
  value, onValueChange, disabled, accessibilityLabel, accessibilityHint,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const C = useTheme().palette;
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      trackColor={{ false: C.line, true: C.lime }}
      thumbColor={C.chalk}
      ios_backgroundColor={C.line}
      style={{ opacity: disabled ? STATE_OPACITY.disabled : 1 }}
    />
  );
}
