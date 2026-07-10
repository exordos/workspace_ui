import { useCallback } from "react";

export function useFolderDialogAction(
  folderActionPath: string | null,
  setFolderDialog: (value: null) => void,
  setFolderActionPending: (value: boolean) => void,
  action: (path: string) => Promise<void>,
) {
  return useCallback(async () => {
    if (folderActionPath == null) return;
    setFolderActionPending(true);
    try {
      await action(folderActionPath);
      setFolderDialog(null);
    } catch {
      /* error shown in store */
    } finally {
      setFolderActionPending(false);
    }
  }, [action, folderActionPath, setFolderActionPending, setFolderDialog]);
}

export function useFolderDialogSubmitAction<T>(
  folderActionPath: string | null,
  setFolderDialog: (value: null) => void,
  setFolderActionPending: (value: boolean) => void,
  action: (path: string, value: T) => Promise<void>,
) {
  return useCallback(
    async (value: T) => {
      if (folderActionPath == null) return;
      setFolderActionPending(true);
      try {
        await action(folderActionPath, value);
        setFolderDialog(null);
      } catch {
        /* error shown in store */
      } finally {
        setFolderActionPending(false);
      }
    },
    [action, folderActionPath, setFolderActionPending, setFolderDialog],
  );
}
