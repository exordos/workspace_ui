import { t } from "~/i18n/i18n";
import type { PresenceVisual } from "~/shared/ui/presence-indicator";

export function resolveMentionPresenceText(options: {
  presenceState: PresenceVisual;
  lastSeen: string | undefined;
}): string {
  if (options.presenceState === "active") {
    return t("presence.online");
  }
  if (options.presenceState === "idle") {
    return t("presence.away");
  }
  if (options.presenceState === "do_not_disturb") {
    return t("presence.doNotDisturb");
  }
  if (options.lastSeen != null) {
    if (
      options.lastSeen === t("presence.online") ||
      options.lastSeen === t("presence.away") ||
      options.lastSeen === t("presence.offline") ||
      options.lastSeen === t("presence.doNotDisturb")
    ) {
      return options.lastSeen;
    }
    return t("presence.lastSeen", { time: options.lastSeen });
  }
  return t("presence.offline");
}
