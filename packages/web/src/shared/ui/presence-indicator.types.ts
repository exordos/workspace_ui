export type PresenceVisual = "active" | "idle" | "offline" | null;

export interface PresenceIndicatorProps {
  status: PresenceVisual;
  size?: "sm" | "md" | "lg";
  className?: string;
  withBorder?: boolean;
}
