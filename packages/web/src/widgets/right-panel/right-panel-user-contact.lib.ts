import { t } from "~/i18n/i18n";
import { isValidEmail, isValidUrl } from "~/shared/lib/validation";
import { buildMailtoHref, buildTelHref, formatDateJoined } from "./right-panel.lib";
import type { RightPanelUserInfo } from "./right-panel.types";

export type RightPanelUserContactIcon =
  | "mail"
  | "phone"
  | "profile"
  | "calendar"
  | "businessCenter"
  | "handshake"
  | "group"
  | "info";

export interface RightPanelUserContactRow {
  label: string;
  value: string;
  icon: RightPanelUserContactIcon;
  copyValue?: string;
  copyAriaLabel?: string;
  href?: string;
  external?: boolean;
}

function optionalAccountTypeLabel(user: RightPanelUserInfo): string | undefined {
  if (user.isBot == null) return undefined;
  return user.isBot ? t("info.botAccount") : t("info.humanAccount");
}

function optionalAccountStatusLabel(user: RightPanelUserInfo): string | undefined {
  if (user.isActive == null) return undefined;
  return user.isActive ? t("info.active") : t("info.deactivated");
}

/** Builds contact/detail rows for the DM user info panel. */
export function buildRightPanelUserContactRows(
  user: RightPanelUserInfo,
): RightPanelUserContactRow[] {
  const primaryEmail = user.email != null && user.email.length > 0 ? user.email : user.username;
  const userIdLink =
    user.profileLink != null && user.profileLink.length > 0 && isValidUrl(user.profileLink)
      ? user.profileLink
      : undefined;
  const joinedDate = formatDateJoined(user.dateJoined);
  const accountType = optionalAccountTypeLabel(user);
  const accountStatus = optionalAccountStatusLabel(user);
  const managerTrimmed = user.manager?.trim();

  return [
    user.userId != null && {
      label: t("info.userId"),
      value: String(user.userId),
      copyValue: String(user.userId),
      copyAriaLabel: t("info.copyUserId"),
      icon: "profile" as const,
      href: userIdLink,
      external: true,
    },
    primaryEmail != null &&
      primaryEmail.length > 0 && {
        label: t("common.email"),
        value: primaryEmail,
        copyValue: primaryEmail,
        copyAriaLabel: t("info.copyEmail"),
        icon: "mail" as const,
      },
    user.jobTitle && {
      label: t("info.jobTitle"),
      value: user.jobTitle,
      icon: "businessCenter" as const,
    },
    managerTrimmed != null &&
      managerTrimmed.length > 0 && {
        label: t("info.manager"),
        value: managerTrimmed,
        icon: "handshake" as const,
        href: isValidEmail(managerTrimmed) ? buildMailtoHref(managerTrimmed) : undefined,
      },
    user.phone && {
      label: t("info.phone"),
      value: user.phone,
      icon: "phone" as const,
      href: buildTelHref(user.phone),
    },
    user.role && { label: t("info.role"), value: user.role, icon: "profile" as const },
    accountType && { label: t("info.accountType"), value: accountType, icon: "group" as const },
    accountStatus && {
      label: t("info.accountStatus"),
      value: accountStatus,
      icon: "info" as const,
    },
    user.timezone && { label: t("info.timezone"), value: user.timezone, icon: "calendar" as const },
    user.localTime && {
      label: t("info.localTime"),
      value: user.localTime,
      icon: "calendar" as const,
    },
    joinedDate && { label: t("info.joined"), value: joinedDate, icon: "calendar" as const },
    user.birthday && { label: t("info.birthday"), value: user.birthday, icon: "calendar" as const },
  ].filter(Boolean) as RightPanelUserContactRow[];
}
