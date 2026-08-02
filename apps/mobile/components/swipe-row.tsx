import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { fs, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

// Swipe a set row left to reveal a Delete action — for sets added by accident.
// Built on Animated + PanResponder (no native gesture-handler dependency, so it
// works in the existing dev build). Only claims clearly-horizontal drags, so the
// numeric inputs still focus on tap and the list still scrolls vertically.
// Shared by the live logger (app/workout.tsx) and the Builder's set ledger.
export default function SwipeRow({ children, onDelete, label, background }: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  /** Row surface colour — must match the host card so the covered delete button
   *  can't bleed through (defaults to the live logger's card token). */
  background?: string;
}) {
  const C = useTheme().palette;
  const tx = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -76 : 0;
        tx.setValue(Math.max(-110, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const open = openRef.current ? g.dx < 40 : g.dx < -40;
        openRef.current = open;
        Animated.spring(tx, { toValue: open ? -76 : 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
      },
    }),
  ).current;
  return (
    <View style={{ position: "relative", marginBottom: 6, overflow: "hidden" }}>
      <Pressable
        onPress={onDelete}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 76, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 12 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{label}</Text>
      </Pressable>
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: background ?? C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
