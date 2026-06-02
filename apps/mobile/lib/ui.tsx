import type { ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@hybrid/core";

export const C = colors;

// Loaded in app/_layout.tsx
export const F = {
  reg: "Archivo_400Regular",
  semi: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_900Black",
  mono: "JetBrainsMono_400Regular",
} as const;

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 48 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={C.lime}
              colors={[C.lime]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 56, alignItems: "center" }}>
      <ActivityIndicator color={C.lime} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Kicker({ children, color = C.ash }: { children: ReactNode; color?: string }) {
  return <Text style={[t.kicker, { color }]}>{children}</Text>;
}

export function Mono({ children, style, color = C.ash }: { children: ReactNode; style?: TextStyle; color?: string }) {
  return <Text style={[{ fontFamily: F.mono, fontSize: 13, color }, style]}>{children}</Text>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={t.h1}>{children}</Text>;
}

export function Chip({ children, color = C.lime }: { children: ReactNode; color?: string }) {
  return (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.semi, fontSize: 11, color, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  color = C.lime,
  disabled,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: color,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
});

const t = StyleSheet.create({
  kicker: {
    fontFamily: F.mono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  h1: {
    fontFamily: F.black,
    fontSize: 30,
    color: C.chalk,
    letterSpacing: -1,
  },
});
