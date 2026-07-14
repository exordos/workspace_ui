import { useEffect } from "react";
import { useMailStore } from "~/entities/mail/mail.model";

/** Connects calendar to the same IAM-authenticated Workspace session as messenger. */
export function useCalendarPageBootstrap(): void {
  const hydrateSession = useMailStore((state) => state.hydrateSession);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);
}
