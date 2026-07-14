import { useMailStore } from "~/entities/mail/mail.model";

/** Mail and calendar share the current Workspace IAM-authenticated session. */
export function useCalendarViewAuth() {
  const session = useMailStore((state) => state.session);
  const mailError = useMailStore((state) => state.error);
  return { session, mailError };
}
