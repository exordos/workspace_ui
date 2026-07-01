import { t } from "~/i18n/i18n";

export function resolveLastSeenLabel(lastSeen: string | null | undefined): string | null {
  if (lastSeen == null) {
    return null;
  }
  if (
    lastSeen === t("presence.online") ||
    lastSeen === t("presence.away") ||
    lastSeen === t("presence.offline") ||
    lastSeen === t("presence.doNotDisturb")
  ) {
    return lastSeen;
  }
  return t("presence.lastSeen", { time: lastSeen });
}
