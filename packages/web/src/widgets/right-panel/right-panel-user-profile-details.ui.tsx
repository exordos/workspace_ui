import React from "react";
import type { WorkspaceRightPanelDirectPrivateDetailId } from "~/entities/messenger/messenger-right-panel.lib";
import type { ProfileDraft } from "~/features/user-profile/user-profile-editor.lib";
import { ProfileEditorField } from "~/features/user-profile/user-profile-editor.ui";
import { t } from "~/i18n/i18n";
import { Copyable } from "~/shared/ui/copyable";
import { Icon, type IconName } from "~/shared/ui/icon";
import type { RightPanelUserProfileDetailsProps } from "./right-panel-user-profile.types";

/**
 * Figma `grop contrnt` (12697:37391 / 12697:38139):
 * - list gap 12px
 * - each row height 36px (label 12/16 + gap 4 + value 14/16)
 * - leading icon box 32×32; glyphs share one optical size after SVG viewBox normalize
 * - trailing copy 24×24
 * - bottom-aligned row (counterAxisAlign MAX)
 */
const PROFILE_DETAIL_ICON_SIZE = 24;
const PROFILE_DETAIL_COPY_ICON_SIZE = 24;

const DETAIL_CONFIG: Record<
  WorkspaceRightPanelDirectPrivateDetailId,
  {
    label: () => string;
    icon: IconName;
  }
> = {
  userId: {
    label: () => t("info.userId"),
    icon: "alternate_email",
  },
  email: {
    label: () => t("common.email"),
    icon: "mail",
  },
  phone: {
    label: () => t("info.phone"),
    icon: "phone",
  },
  jobTitle: {
    label: () => t("info.jobTitle"),
    icon: "businessCenter",
  },
  manager: {
    label: () => t("info.manager"),
    icon: "handshake",
  },
  role: {
    label: () => t("info.role"),
    icon: "accountCircle",
  },
  accountType: {
    label: () => t("info.accountType"),
    icon: "group",
  },
  accountStatus: {
    label: () => t("info.accountStatus"),
    icon: "info",
  },
  timezone: {
    label: () => t("info.timezone"),
    icon: "globe_location_pin",
  },
  localTime: {
    label: () => t("info.localTime"),
    icon: "schedule",
  },
  joined: {
    label: () => t("info.joined"),
    icon: "calendar_month",
  },
  birthday: {
    label: () => t("info.birthday"),
    icon: "celebration",
  },
};

interface ProfileDetailRowProps {
  id: string;
  label: string;
  icon: IconName;
  value: string;
  unavailable?: boolean;
  editing?: React.ReactNode;
  multiline?: boolean;
}

function ProfileDetailRow({
  id,
  label,
  icon,
  value,
  unavailable = false,
  editing,
  multiline = false,
}: Readonly<ProfileDetailRowProps>) {
  const editable = editing != null;
  return (
    <li
      className={`flex justify-between gap-3 ${editable || multiline ? "min-h-9 items-start" : "h-9 items-end"}`}
      data-testid={`right-panel-profile-detail-${id}`}
    >
      <div
        className={`flex min-w-0 flex-1 gap-3 ${editable || multiline ? "items-start" : "items-end"}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center text-icon-base ${editable || multiline ? "mt-5" : ""}`}
        >
          <Icon name={icon} size={PROFILE_DETAIL_ICON_SIZE} className="text-current" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className="truncate text-xs font-normal leading-4 text-text-secondary">{label}</p>
          {editing ?? (
            <span
              className={`block text-sm leading-4 ${multiline ? "whitespace-pre-wrap break-words" : "truncate whitespace-nowrap"} ${
                unavailable ? "italic text-text-muted" : "text-text-primary"
              }`}
            >
              {value}
            </span>
          )}
        </div>
      </div>
      {!editable && !unavailable && !multiline ? (
        <Copyable
          value={value}
          showOnHover={false}
          iconSize={PROFILE_DETAIL_COPY_ICON_SIZE}
          className="shrink-0"
        />
      ) : null}
    </li>
  );
}

export const RightPanelUserProfileDetails: React.FC<RightPanelUserProfileDetailsProps> = ({
  details,
  description,
  editing,
}) => {
  const identityFields: { field: keyof ProfileDraft; label: string; icon: IconName }[] = [
    { field: "firstName", label: t("settings.profileFirstName"), icon: "accountCircle" },
    { field: "lastName", label: t("settings.profileLastName"), icon: "accountCircle" },
    { field: "username", label: t("info.username"), icon: "alternate_email" },
  ];
  return (
    <ul className="space-y-3" data-testid="right-panel-user-profile-details">
      {editing != null &&
        identityFields.map(({ field, label, icon }) => (
          <ProfileDetailRow
            key={field}
            id={field}
            label={label}
            icon={icon}
            value={editing.draft[field]}
            editing={
              <ProfileEditorField
                field={field}
                label={label}
                value={editing.draft[field]}
                disabled={editing.disabled}
                onChange={editing.onChange}
              />
            }
          />
        ))}
      {details.map((detail) => {
        const config = DETAIL_CONFIG[detail.id];
        const label = config.label();
        return (
          <ProfileDetailRow
            key={detail.id}
            id={detail.id}
            label={label}
            icon={config.icon}
            value={detail.value}
            unavailable={detail.isTemporarilyUnavailable}
            editing={
              detail.id === "phone" && editing != null ? (
                <ProfileEditorField
                  field="phone"
                  label={label}
                  value={editing.draft.phone}
                  disabled={editing.disabled}
                  onChange={editing.onChange}
                />
              ) : undefined
            }
          />
        );
      })}
      {(editing != null || !!description) && (
        <ProfileDetailRow
          id="description"
          label={t("settings.profileDescription")}
          icon="info"
          value={description ?? ""}
          multiline
          editing={
            editing != null ? (
              <ProfileEditorField
                field="description"
                label={t("settings.profileDescription")}
                value={editing.draft.description}
                disabled={editing.disabled}
                onChange={editing.onChange}
              />
            ) : undefined
          }
        />
      )}
    </ul>
  );
};
