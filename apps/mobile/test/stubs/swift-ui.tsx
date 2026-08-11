/** `@expo/ui/swift-ui` + its modifiers. SwiftUI is iOS-only and the gate runs
 *  off-iOS, so `LIQUID_GLASS_SUPPORTED` is false and none of this renders — the
 *  stubs exist only so the module graph resolves. */
import { View, type ViewProps } from "react-native";
import type { ReactNode } from "react";

const Box = ({ children, ...p }: ViewProps & { children?: ReactNode }) => <View {...p}>{children}</View>;

export const Divider = Box;
export const Host = Box;
export const HStack = Box;
export const VStack = Box;
export const Spacer = Box;
export const Menu = Box;
export const Picker = Box;
export const RNHostView = Box;
const CM = Box as typeof Box & { Trigger: typeof Box; Items: typeof Box; Preview: typeof Box };
CM.Trigger = Box;
CM.Items = Box;
CM.Preview = Box;
export const ContextMenu = CM;
export const Text = Box;
export const Image = Box;
export const Button = Box;
export const RoundedRectangle = Box;
export const GlassEffectContainer = Box;
export const Namespace = Box;
export const DatePicker = Box;
export const Stepper = Box;
export const ContentUnavailableView = Box;

/* modifiers — chainable no-ops */
const modifier = () => ({});
export const accessibilityLabel = modifier;
export const animation = modifier;
export const Animation = { easeInOut: modifier, spring: modifier, default: modifier };
export const background = modifier;
export const buttonBorderShape = modifier;
export const buttonStyle = modifier;
export const clipShape = modifier;
export const contentShape = modifier;
export const datePickerStyle = modifier;
export const disabled = modifier;
export const font = modifier;
export const foregroundColor = modifier;
export const frame = modifier;
export const glassEffect = modifier;
export const glassEffectId = modifier;
export const padding = modifier;
export const pickerStyle = modifier;
export const shapes = { rectangle: modifier, circle: modifier, capsule: modifier, ellipse: modifier, roundedRectangle: modifier, containerRelativeShape: modifier };
export const tag = modifier;
export const tint = modifier;
