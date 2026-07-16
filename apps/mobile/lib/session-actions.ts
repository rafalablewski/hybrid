import { useState } from "react";
import { Alert } from "react-native";
import { archiveSession, deleteSession } from "./api";
import { useRevalidate } from "./queries";
import { useLang } from "./i18n";

/** The one archive/restore/delete flow for a logged session — busy tracking,
 *  react-query invalidation, the delete confirm and the error alerts — shared
 *  by the History archived list and the session-detail manage row so the two
 *  surfaces can't drift. */
export function useSessionActions() {
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archive = async (id: string, archived: boolean): Promise<boolean> => {
    setBusyId(id);
    const ok = await archiveSession(id, archived);
    setBusyId(null);
    if (ok) void revalidate.sessions();
    else Alert.alert(t("common.error"), archived ? t("history.archiveError") : t("history.restoreError"));
    return ok;
  };

  const confirmDelete = (s: { id: string; title: string }, onDeleted?: () => void) =>
    Alert.alert(t("history.deleteWorkout"), `“${s.title}” ${t("history.deleteWorkoutBody")}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setBusyId(s.id);
          const ok = await deleteSession(s.id);
          setBusyId(null);
          if (ok) {
            void revalidate.sessions();
            onDeleted?.();
          } else Alert.alert(t("common.error"), t("history.deleteError"));
        },
      },
    ]);

  return { archive, confirmDelete, busyId };
}
