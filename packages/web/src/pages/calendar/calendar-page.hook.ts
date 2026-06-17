import { useEffect } from "react";
import { useMailStore } from "~/entities/mail/mail.model";

/** Restores mailbox session from sessionStorage when the calendar page mounts. */
export function useCalendarPageBootstrap(): void {
  const hydrateSession = useMailStore((s) => s.hydrateSession);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);
}
