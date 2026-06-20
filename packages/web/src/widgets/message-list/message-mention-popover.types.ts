import type { UserId } from "~/shared/lib/user-id.lib";

export interface MessageMentionPopoverProps {
  userId: UserId;
  anchorRect: DOMRect;
  /** Display name from mention markup when the user is not yet in the store. */
  fallbackName: string;
  onClose: () => void;
  onOpenDirectMessage: (userId: UserId) => void;
  /** Opens full user profile (e.g. manager link in custom profile fields). */
  onOpenUserProfile?: (userId: UserId) => void;
}
