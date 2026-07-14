export interface MailMessageRowVisualState {
  active: boolean;
  unread: boolean;
  flagged: boolean;
}

export function resolveMailMessageRowClasses(state: MailMessageRowVisualState): {
  row: string;
  showUnreadDot: boolean;
} {
  const { active, unread, flagged } = state;

  if (active) {
    return {
      row: "border-l-accent bg-card-bg-active",
      showUnreadDot: false,
    };
  }

  if (flagged) {
    return {
      row: "border-l-transparent bg-accent-soft/20",
      showUnreadDot: unread,
    };
  }

  if (unread) {
    return {
      row: "border-l-transparent",
      showUnreadDot: true,
    };
  }

  return {
    row: "border-l-transparent",
    showUnreadDot: false,
  };
}
