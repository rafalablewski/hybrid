/**
 * expo-notifications, stubbed — and in its OWN file for one reason: it is the
 * only native module the `pure` project needs, and everything else in
 * native.tsx imports `react-native`, which pure has no alias for by design.
 *
 * Each export is a no-op that denies permission, which keeps the render gate
 * off every path that would register a token. `pure` tests that want the real
 * path spy on these instead (see lib/recovery-reminder.test.ts).
 *
 * native.tsx re-exports this file rather than keeping a second copy, so the two
 * projects can never disagree about what the native edge looks like.
 */
export const setNotificationHandler = () => {};
export const getPermissionsAsync = async () => ({ status: "undetermined" as const });
export const requestPermissionsAsync = async () => ({ status: "undetermined" as const });
export const getDevicePushTokenAsync = async () => ({ type: "ios" as const, data: "" });
export const getLastNotificationResponseAsync = async () => null;
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const addPushTokenListener = () => ({ remove() {} });
export const scheduleNotificationAsync = async (): Promise<string> => "stub-notification-id";
export const cancelScheduledNotificationAsync = async (_id?: string): Promise<void> => {};
export const SchedulableTriggerInputTypes = { TIME_INTERVAL: "timeInterval" } as const;
export const setNotificationCategoryAsync = async (_id?: string, _actions?: unknown): Promise<void> => {};
/** iOS's identifier for "tapped the body", as opposed to one of the buttons. */
export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";
