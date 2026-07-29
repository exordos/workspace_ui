import React from "react";
import type { WorkspaceRightPanelDirectPrivateDetailId } from "~/entities/messenger/messenger-right-panel.lib";
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

export const RightPanelUserProfileDetails: React.FC<RightPanelUserProfileDetailsProps> = ({
  details,
}) => {
  return (
    <ul className="space-y-3" data-testid="right-panel-user-profile-details">
      {details.map((detail) => {
        const config = DETAIL_CONFIG[detail.id];
        const valueNode = (
          <span
            className={`block truncate whitespace-nowrap text-sm leading-4 ${
              detail.isTemporarilyUnavailable ? "italic text-text-muted" : "text-text-primary"
            }`}
          >
            {detail.value}
          </span>
        );

        return (
          <li
            key={detail.id}
            className="flex h-9 items-end justify-between gap-3"
            data-testid={`right-panel-profile-detail-${detail.id}`}
          >
            <div className="flex min-w-0 flex-1 items-end gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-icon-base">
                <Icon name={config.icon} size={PROFILE_DETAIL_ICON_SIZE} className="text-current" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                {/* Figma label: 12 Regular / 16 LH, sentence case — not SectionLabel uppercase */}
                <p className="truncate text-xs font-normal leading-4 text-text-secondary">
                  {config.label()}
                </p>
                {valueNode}
              </div>
            </div>
            {!detail.isTemporarilyUnavailable ? (
              <Copyable
                value={detail.value}
                showOnHover={false}
                iconSize={PROFILE_DETAIL_COPY_ICON_SIZE}
                className="shrink-0"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};
