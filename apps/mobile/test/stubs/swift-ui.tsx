/** `@expo/ui/swift-ui` + its modifiers. SwiftUI is iOS-only and the gate runs
 *  off-iOS, so `LIQUID_GLASS_SUPPORTED` is false and none of this renders — the
 *  stubs exist only so the module graph resolves. */
import { View, type ViewProps } from "react-native";
import type { ReactNode } from "react";

const Box = ({ children, ...p }: ViewProps & { children?: ReactNode }) => <View {...p}>{children}</View>;

export const Host = Box;
export const HStack = Box;
export const VStack = Box;
export const Spacer = Box;
export const Picker = Box;
export const Text = Box;
export const Image = Box;
export const Button = Box;
export const RoundedRectangle = Box;
export const GlassEffectContainer = Box;
export const Namespace = Box;

/* modifiers — chainable no-ops */
const modifier = () => ({});
export const animation = modifier;
export const Animation = { easeInOut: modifier, spring: modifier, default: modifier };
export const background = modifier;
export const clipShape = modifier;
export const frame = modifier;
export const glassEffect = modifier;
export const glassEffectId = modifier;
export const padding = modifier;
export const pickerStyle = modifier;
export const tag = modifier;
export const tint = modifier;
