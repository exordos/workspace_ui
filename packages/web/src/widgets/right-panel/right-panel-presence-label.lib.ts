import { t } from "~/i18n/i18n";

export function resolveLastSeenLabel(lastSeen: string | null | undefined): string | null {
  if (lastSeen == null) {
    return null;
  }
  if (lastSeen === t("presence.online")) {
    return t("presence.online");
  }
  return t("presence.lastSeen", { time: lastSeen });
}
