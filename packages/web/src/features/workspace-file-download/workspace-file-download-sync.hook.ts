import { useEffect } from "react";
import { useDownloadStore } from "~/entities/download/download.model";

export function useWorkspaceDownloadSync(): void {
  useEffect(() => {
    const downloads = window.electronAPI?.downloads;
    if (downloads == null) return;

    let disposed = false;
    let snapshotApplied = false;
    const pendingEvents: Parameters<Parameters<typeof downloads.onChanged>[0]>[0][] = [];

    const applyEvent = (event: Parameters<Parameters<typeof downloads.onChanged>[0]>[0]) => {
      if (event.type === "upsert") {
        useDownloadStore.getState().upsertDownload(event.entry);
        return;
      }
      for (const id of event.ids) useDownloadStore.getState().removeDownload(id);
    };

    const unsubscribe = downloads.onChanged((event) => {
      if (disposed) return;
      if (!snapshotApplied) {
        pendingEvents.push(event);
        return;
      }
      applyEvent(event);
    });

    const finishSnapshot = (entries?: ElectronDownloadEntry[]) => {
      if (disposed) return;
      if (entries != null) {
        const snapshotIds = new Set(entries.map((entry) => entry.id));
        const localPending = useDownloadStore
          .getState()
          .entries.filter(
            (entry) =>
              (entry.status === "starting" || entry.status === "downloading") &&
              !snapshotIds.has(entry.id),
          );
        useDownloadStore.getState().replaceDownloads([...entries, ...localPending]);
      }
      snapshotApplied = true;
      for (const event of pendingEvents) applyEvent(event);
      pendingEvents.length = 0;
    };

    void downloads.getSnapshot().then(
      (entries) => finishSnapshot(entries),
      () => finishSnapshot(),
    );

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);
}
