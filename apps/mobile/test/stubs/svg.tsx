/** react-native-svg — every element is a leaf box for layout purposes. The gate
 *  asserts on structure, not on drawn geometry (the path DATA is already
 *  guarded in core's sport-mark tests). */
import { View, type ViewProps } from "react-native";
import type { ReactNode } from "react";

const Node = ({ children, ...p }: ViewProps & { children?: ReactNode }) => <View {...p}>{children}</View>;

export default Node;
export const Svg = Node;
export const Circle = Node;
export const ClipPath = Node;
export const Defs = Node;
export const Ellipse = Node;
export const G = Node;
export const Line = Node;
export const LinearGradient = Node;
export const Mask = Node;
export const Path = Node;
export const Polygon = Node;
export const Polyline = Node;
export const RadialGradient = Node;
export const Rect = Node;
export const Stop = Node;
export const Text = Node;
export const TSpan = Node;
export const Use = Node;
