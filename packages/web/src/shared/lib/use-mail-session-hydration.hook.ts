import { useEffect } from "react";
import { useMailStore } from "~/entities/mail/mail.model";

/** Restores mailbox session from sessionStorage when a mail/calendar page mounts. */
export function useMailSessionHydration(): void {
  const hydrateSession = useMailStore((s) => s.hydrateSession);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);
}
