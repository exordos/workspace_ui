/**
 * Semantic text color classes for presence status labels (profile header, etc.).
 * Aligned with PresenceIndicator dots and Figma online green (#26c038 → call-green).
 */

export type PresenceLabelStatus = "active" | "idle" | "offline" | "do_not_disturb";

const PRESENCE_STATUS_TEXT_CLASS: Record<PresenceLabelStatus, string> = {
  active: "text-call-green",
  idle: "text-indicator-orange",
  // Dot maps DND → idle; the label stays distinct (red).
  do_not_disturb: "text-call-red",
  offline: "text-text-muted",
};

/** Tailwind text token for a presence status label. */
export function resolvePresenceStatusTextClass(
  status: PresenceLabelStatus | null | undefined,
): string {
  if (status == null) {
    return PRESENCE_STATUS_TEXT_CLASS.offline;
  }
  return PRESENCE_STATUS_TEXT_CLASS[status];
}
