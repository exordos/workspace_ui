import type {
  MailComposeInitialState,
  MailComposeMode,
  MailComposePayload,
} from "~/entities/mail/mail.types";

export interface MailComposeDialogProps {
  open: boolean;
  mode: MailComposeMode;
  initial: MailComposeInitialState | null;
  sending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSend: (payload: MailComposePayload) => void;
}
