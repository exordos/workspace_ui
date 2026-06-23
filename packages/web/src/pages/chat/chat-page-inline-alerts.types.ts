export interface ChatPageInlineAlertsProps {
  routeResolveError: string | null;
  actionError: string | null;
  sendError: string | null;
  onDismissRouteResolveError: () => void;
  onDismissActionError: () => void;
  onDismissSendError: () => void;
}
