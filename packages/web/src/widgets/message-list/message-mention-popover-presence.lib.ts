import { t } from "~/i18n/i18n";

export function resolveMentionPresenceText(options: {
  presenceState: "active" | "idle" | "offline" | null;
  lastSeen: string | undefined;
}): string {
  if (options.presenceState === "active") {
    return t("presence.online");
  }
  if (options.presenceState === "idle") {
    return t("presence.away");
  }
  if (options.lastSeen != null) {
    if (options.lastSeen === t("presence.online")) {
      return t("presence.online");
    }
    return t("presence.lastSeen", { time: options.lastSeen });
  }
  return t("presence.offline");
}
