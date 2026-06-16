import { useEffect } from "react";
import { useMailStore } from "~/entities/mail/mail.model";

/** Restores mail session from sessionStorage when the mail page mounts. */
export function useMailPageBootstrap(): void {
  const hydrateSession = useMailStore((s) => s.hydrateSession);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);
}
