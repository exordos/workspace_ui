export interface MessageMentionPopoverProps {
  userId: number;
  anchorRect: DOMRect;
  /** Display name from mention markup when the user is not yet in the store. */
  fallbackName: string;
  onClose: () => void;
  onOpenDirectMessage: (userId: number) => void;
  /** Opens full user profile (e.g. manager link in custom profile fields). */
  onOpenUserProfile?: (userId: number) => void;
}
