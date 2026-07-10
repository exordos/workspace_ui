import { useMailSessionHydration } from "~/shared/lib/use-mail-session-hydration.hook";

/** Restores mailbox session from sessionStorage when the calendar page mounts. */
export function useCalendarPageBootstrap(): void {
  useMailSessionHydration();
}
