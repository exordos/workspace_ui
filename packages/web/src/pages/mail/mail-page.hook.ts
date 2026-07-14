import { useEffect } from "react";
import { useMailStore } from "~/entities/mail/mail.model";

/** Connects the page to the current IAM-authenticated Workspace session. */
export function useMailPageBootstrap(): void {
  const hydrateSession = useMailStore((state) => state.hydrateSession);
  const loadFolders = useMailStore((state) => state.loadFolders);

  useEffect(() => {
    hydrateSession();
    void loadFolders();
  }, [hydrateSession, loadFolders]);
}
