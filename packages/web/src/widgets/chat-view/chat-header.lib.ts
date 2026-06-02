import { t } from "~/i18n/i18n";
import type { ChatHeaderProps } from "./chat-header.types";

export function resolveDmPresenceText(
  dmPartner: NonNullable<ChatHeaderProps["dmPartner"]>,
): string {
  if (dmPartner.presenceState === "active") {
    return t("presence.online");
  }
  if (dmPartner.presenceState === "idle") {
    return t("presence.away");
  }
  if (dmPartner.lastSeen == null) {
    return t("presence.offline");
  }
  if (dmPartner.lastSeen === t("presence.online")) {
    return t("presence.online");
  }
  return t("presence.lastSeen", { time: dmPartner.lastSeen });
}

export function resolveDmStatusText(dmPartner: NonNullable<ChatHeaderProps["dmPartner"]>): string {
  if (dmPartner.isAccountDeactivated) {
    return t("dm.partnerBlocked");
  }
  if (dmPartner.isTyping === true) {
    return t("chat.typing");
  }
  return dmPartner.customStatus ?? resolveDmPresenceText(dmPartner);
}
