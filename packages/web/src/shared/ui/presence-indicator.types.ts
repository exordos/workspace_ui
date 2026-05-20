export type PresenceVisual = "active" | "idle" | "offline" | null;

export interface PresenceIndicatorProps {
  status: PresenceVisual;
  /** Zulip `is_active === false` — gray block badge instead of presence dot. */
  deactivated?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  withBorder?: boolean;
  tone?: "default" | "header";
  pulse?: boolean;
}
