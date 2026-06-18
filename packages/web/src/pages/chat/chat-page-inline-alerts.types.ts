export interface ChatPageInlineAlertsProps {
  actionError: string | null;
  sendError: string | null;
  onDismissActionError: () => void;
  onDismissSendError: () => void;
}
