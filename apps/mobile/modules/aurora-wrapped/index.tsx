// JS bridge for the native SwiftUI "wrapped" card (the Aurora-derived SwiftUI
// theme). On an EAS/Xcode build the native AuroraWrapped view is registered and
// `auroraWrappedNativeAvailable` is true; in Expo Go or a JS-only run the native
// view isn't present, the flag is false, and callers fall back to the
// cross-platform RN card (SlideStoryCard). This keeps web↔mobile parity intact
// today while the genuine SwiftUI rendering ships with the native build.
import * as React from "react";
import { View, type ViewProps } from "react-native";
import { requireNativeViewManager } from "expo-modules-core";

export type AuroraWrappedProps = ViewProps & {
  /** JSON-encoded slide payload (see slidePayload in app/workout.tsx). */
  payload: string;
};

let NativeView: React.ComponentType<AuroraWrappedProps> | null = null;
try {
  NativeView = requireNativeViewManager("AuroraWrapped");
} catch {
  // Native module not in this build (Expo Go / JS-only) — fall back.
  NativeView = null;
}

/** True only when the native SwiftUI module is compiled into the build. */
export const auroraWrappedNativeAvailable = NativeView != null;

/** Native SwiftUI wrapped card. Returns null when the native module is absent
 *  (callers should render the RN fallback in that case). */
export const AuroraWrappedNative = React.forwardRef<View, AuroraWrappedProps>(function AuroraWrappedNative(props, ref) {
  if (!NativeView) return null;
  // Native views accept a ref to their host view (captureable by view-shot).
  // createElement (not JSX) so the ref threads through the native component
  // without tripping the view manager's prop typing.
  return React.createElement(NativeView as React.ComponentType<AuroraWrappedProps & { ref?: React.Ref<View> }>, { ...props, ref });
});
