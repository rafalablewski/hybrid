/**
 * THE NATIVE EDGE, stubbed.
 *
 * Everything aliased to this file is a module the render gate cannot execute: a
 * native view (blur, gradient), a native capability (haptics, status bar,
 * safe-area metrics) or a navigation singleton that expects a running app. Each
 * stub is the SMALLEST thing that keeps the tree renderable — a passthrough
 * box, a no-op, a fixed reading — because the gate's subject is the layout our
 * own code builds, never the fidelity of a vendor's view.
 *
 * Rule of thumb when adding one: if a stub starts making decisions, it is
 * standing in for something that should have been tested for real.
 */
import { View, type ViewProps } from "react-native";
import type { ReactNode } from "react";

/** A native view that is, for layout purposes, a plain box. */
const Box = ({ children, ...p }: ViewProps & { children?: ReactNode }) => <View {...p}>{children}</View>;

/* ── expo-blur / expo-linear-gradient ────────────────────────────────────── */
export const BlurView = Box;
export const LinearGradient = Box;

/* ── expo-status-bar ─────────────────────────────────────────────────────── */
export const StatusBar = () => null;

/* ── react-native-safe-area-context ──────────────────────────────────────── */
/** A notched iPhone, so the gate exercises a non-zero inset rather than the
 *  degenerate 0 that hides every safe-area mistake. */
export const SAFE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
export const useSafeAreaInsets = () => SAFE_INSETS;
export const SafeAreaView = Box;
export const SafeAreaProvider = Box;

/* ── expo-haptics (imported as a namespace) ──────────────────────────────── */
export const selectionAsync = async () => {};
export const impactAsync = async () => {};
export const notificationAsync = async () => {};
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" } as const;
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" } as const;

/* ── expo-router ─────────────────────────────────────────────────────────── */
export const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, navigate: () => {} });
export const useFocusEffect = () => {};
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/";
export const Link = Box;

/* ── expo-secure-store (the Supabase session store) ──────────────────────── */
const secure = new Map<string, string>();
export const getItemAsync = async (k: string) => secure.get(k) ?? null;
export const setItemAsync = async (k: string, v: string) => void secure.set(k, v);
export const deleteItemAsync = async (k: string) => void secure.delete(k);
