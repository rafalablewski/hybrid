import { useState } from "react";
import { archiveSession, deleteSession } from "./api";
import { useRevalidate } from "./queries";
import { useLang } from "./i18n";
import { useConfirm } from "../components/aurora/confirm";

/** The one archive/restore/delete flow for a logged session — busy tracking,
 *  react-query invalidation, the delete confirm and the error reports — shared
 *  by the History archived list and the session-detail manage row so the two
 *  surfaces can't drift.
 *
 *  This was the single most consequential Alert.alert in the app: deleting a
 *  session is irreversible and it was the OS asking, not the product. It now
 *  runs on the shared confirm sheet like every other decision. */
export function useSessionActions() {
  const { t } = useLang();
  const { confirm, notify } = useConfirm();
  const revalidate = useRevalidate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archive = async (id: string, archived: boolean): Promise<boolean> => {
    setBusyId(id);
    const ok = await archiveSession(id, archived);
    setBusyId(null);
    if (ok) void revalidate.sessions();
    else void notify(t("common.error"), archived ? t("history.archiveError") : t("history.restoreError"));
    return ok;
  };

  const confirmDelete = async (s: { id: string; title: string }, onDeleted?: () => void) => {
    const ok = await confirm({
      title: t("history.deleteWorkout"),
      message: `“${s.title}” ${t("history.deleteWorkoutBody")}`,
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(s.id);
    const deleted = await deleteSession(s.id);
    setBusyId(null);
    if (deleted) {
      void revalidate.sessions();
      onDeleted?.();
    } else void notify(t("common.error"), t("history.deleteError"));
  };

  return { archive, confirmDelete, busyId };
}
