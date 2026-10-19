export type PresenceVisual = "active" | "idle" | "offline" | null;

export interface PresenceIndicatorProps {
  status: PresenceVisual;
  /** Show a deactivated-account badge instead of the presence dot. */
  deactivated?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  withBorder?: boolean;
}
