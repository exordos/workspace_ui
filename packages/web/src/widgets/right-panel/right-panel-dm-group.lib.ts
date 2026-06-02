import { t } from "~/i18n/i18n";

export function resolveDmGroupMemberSecondaryLine(member: {
  statusLabel: string | null | undefined;
  email: string;
  isOnline: boolean;
}): string {
  if (member.statusLabel) {
    return member.statusLabel;
  }
  if (member.email.length > 0) {
    return member.email;
  }
  return member.isOnline ? t("presence.online") : t("presence.offline");
}
