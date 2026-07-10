import { useMailSessionHydration } from "~/shared/lib/use-mail-session-hydration.hook";

/** Restores mail session from sessionStorage when the mail page mounts. */
export function useMailPageBootstrap(): void {
  useMailSessionHydration();
}
