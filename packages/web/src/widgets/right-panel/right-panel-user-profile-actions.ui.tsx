import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type {
  RightPanelUserProfileActionButtonProps,
  RightPanelUserProfileActionsProps,
} from "./right-panel-user-profile.types";

/**
 * Profile action chip.
 * Figma (12709:38520): 40×40 icon box, 12/16 label, rounded-lg card surface.
 * Middle "Edit" button hugs content (~106px); side buttons flex equally (~88.5px).
 */
const RightPanelUserProfileActionButton = React.memo<RightPanelUserProfileActionButtonProps>(
  function RightPanelUserProfileActionButton({
    label,
    icon,
    iconSize = 28,
    grow = "fill",
    onClick,
    disabled,
    testId,
    dataCopyState,
  }) {
    const growClass = grow === "hug" ? "shrink-0" : "min-w-0 flex-1";

    return (
      <button
        type="button"
        data-testid={testId}
        data-copy-state={dataCopyState}
        disabled={disabled}
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-0 rounded-lg bg-card-bg px-2 py-2 text-center transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50 ${growClass}`}
      >
        {/* 40×40 hit area matches Figma action icon bounding box */}
        <span className="flex h-10 w-10 items-center justify-center">
          <Icon name={icon} size={iconSize} className="text-text-secondary" />
        </span>
        {/* Hug buttons keep full label; fill buttons may ellipsis if space is tight */}
        <span
          className={
            grow === "hug"
              ? "whitespace-nowrap text-xs leading-4 text-text-secondary"
              : "truncate text-xs leading-4 text-text-secondary"
          }
        >
          {label}
        </span>
      </button>
    );
  },
);

export const RightPanelUserProfileActions: React.FC<RightPanelUserProfileActionsProps> = ({
  variant,
  onFavorites,
  onEdit,
  onShare,
  onMessage,
  onCall,
  shareDisabled = false,
  shareCopied = false,
  messagePending = false,
  callPending = false,
}) => {
  // Та же обратная связь, что у Copyable: глиф → галочка ~2 с, без toast снизу.
  const shareLabel = shareCopied ? t("message.copied") : t("info.share");
  const shareIcon = shareCopied ? "check" : "links";
  // links в viewBox 32 «лёгкий» — 40; check плотнее — 28, чтобы вес совпал
  const shareIconSize = shareCopied ? 28 : 40;

  if (variant === "self") {
    return (
      <div className="flex items-stretch gap-2" data-testid="right-panel-user-profile-actions-self">
        <RightPanelUserProfileActionButton
          label={t("common.favorites")}
          icon="home"
          // Figma home vector ≈ 23×26 inside 40 box (outline, not filled)
          iconSize={26}
          onClick={() => onFavorites?.()}
          testId="right-panel-profile-favorites"
        />
        <RightPanelUserProfileActionButton
          label={t("info.edit")}
          icon="border_color"
          // Figma border_color ≈ 29×30; hug width so "Редактировать" does not truncate
          iconSize={30}
          grow="hug"
          onClick={() => onEdit?.()}
          testId="right-panel-profile-edit"
        />
        <RightPanelUserProfileActionButton
          label={shareLabel}
          icon={shareIcon}
          iconSize={shareIconSize}
          onClick={() => onShare?.()}
          disabled={shareDisabled}
          testId="right-panel-profile-share"
          dataCopyState={shareCopied ? "success" : "idle"}
        />
      </div>
    );
  }

  // Чужой профиль: Написать | Позвонить | Поделиться (три равные fill-кнопки).
  return (
    <div className="flex items-stretch gap-2" data-testid="right-panel-user-profile-actions-other">
      <RightPanelUserProfileActionButton
        label={t("info.openDirectMessages")}
        icon="chatBubble"
        onClick={() => onMessage?.()}
        disabled={messagePending}
        testId="right-panel-profile-message"
      />
      <RightPanelUserProfileActionButton
        label={t("call.call")}
        icon="phone"
        // phone glyph ≈ 31×31 в padded viewBox — чуть меньше box 40
        iconSize={30}
        onClick={() => onCall?.()}
        disabled={callPending}
        testId="right-panel-profile-call"
      />
      <RightPanelUserProfileActionButton
        label={shareLabel}
        icon={shareIcon}
        iconSize={shareIconSize}
        onClick={() => onShare?.()}
        disabled={shareDisabled}
        testId="right-panel-profile-share"
        dataCopyState={shareCopied ? "success" : "idle"}
      />
    </div>
  );
};
