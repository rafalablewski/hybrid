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
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" } as const;
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" } as const;

/* ── expo-router ─────────────────────────────────────────────────────────── */
export const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, navigate: () => {} });
export const useFocusEffect = () => {};
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/";
export const Link = Box;

/* ── expo-file-system (the data export writes a file to share) ───────────── */
/** Only the shape the export path constructs; nothing here touches a disk. The
 *  gate reaches this module by IMPORT alone — the drawer pulls in settings for
 *  its search routes — so a module that throws at import time would take down
 *  every screen below it without any file ever being written. */
export const Paths = { cache: "file:///cache", document: "file:///document" };
export class File {
  uri: string;
  constructor(dir: string, name: string) { this.uri = `${dir}/${name}`; }
  create() {}
  write() {}
}

/* ── expo-sharing (the share sheet the export hands its file to) ─────────── */
export const isAvailableAsync = async () => false;
export const shareAsync = async () => {};

/* ── expo-secure-store (the Supabase session store) ──────────────────────── */
const secure = new Map<string, string>();
export const getItemAsync = async (k: string) => secure.get(k) ?? null;
export const setItemAsync = async (k: string, v: string) => void secure.set(k, v);
export const deleteItemAsync = async (k: string) => void secure.delete(k);

/* ── expo-notifications (push + the rest-timer cue) ──────────────────────── */
/** Reached by IMPORT alone, like expo-file-system above: the drawer pulls in
 *  settings, settings pulls in lib/push, and lib/push installs the foreground
 *  presentation handler at module scope — so these have to EXIST or every screen
 *  below the drawer dies at import. Each one is a no-op that denies permission,
 *  which keeps the gate off every path that would register a token. */
export const setNotificationHandler = () => {};
export const getPermissionsAsync = async () => ({ status: "undetermined" as const });
export const requestPermissionsAsync = async () => ({ status: "undetermined" as const });
export const getDevicePushTokenAsync = async () => ({ type: "ios" as const, data: "" });
export const getLastNotificationResponseAsync = async () => null;
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const addPushTokenListener = () => ({ remove() {} });
export const scheduleNotificationAsync = async () => "stub-notification-id";
export const cancelScheduledNotificationAsync = async () => {};
export const SchedulableTriggerInputTypes = { TIME_INTERVAL: "timeInterval" } as const;
