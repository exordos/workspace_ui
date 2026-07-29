import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { t } from "~/i18n/i18n";
import { AppDialogShell } from "~/shared/ui/app-dialog.ui";
import { Icon, type IconName } from "~/shared/ui/icon";
import type { RightPanelUserProfileEditAvatarDialogProps } from "./right-panel-user-profile-edit-avatar-dialog.types";

/**
 * Figma «Edit avatar modal window» (12715:26983):
 * 323×212, radius 12, pad 12/20, actions gap 8, row 32, icon box 32 + glyph 24,
 * cancel 40h / pad 6×16 / accent Medium 14/20.
 *
 * Классы собраны явно (без APP_DIALOG_CONTENT_BASE_CLASS), чтобы не конфликтовать
 * rounded-xl/shadow-xl из общего shell с нужными rounded-2xl / без тени.
 */
const CONTENT_CLASS =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal w-[323px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-subtle bg-bg-elevated p-0";

/** Ряд действия: высота 32, gap иконка→текст 12, Inter Regular 14/20. */
const ACTION_ROW_CLASS =
  "flex h-8 w-full items-center gap-3 rounded-lg text-left text-sm font-normal leading-5 text-text-primary transition-colors hover:bg-card-bg-active/60 disabled:cursor-not-allowed disabled:opacity-50";

/** Cancel: 40h, radius ~8→lg, фон card-bg-active, accent Medium 14/20. */
const CANCEL_BUTTON_CLASS =
  "flex h-10 w-full items-center justify-center rounded-lg bg-card-bg-active px-4 py-1.5 text-sm font-medium leading-5 text-accent transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

interface AvatarActionRowProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  testId: string;
}

const AvatarActionRow = React.memo<AvatarActionRowProps>(
  ({ icon, label, onClick, disabled = false, danger = false, testId }) => {
    // В макете destructive = #f04c4c → token call-red (не danger #d92d20).
    const toneClass = danger ? "text-call-red" : "text-text-muted";
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={ACTION_ROW_CLASS}
        data-testid={testId}
      >
        {/* Bounding box 32×32; глифы Figma: camera 24×21.3, images 21.3², delete 18.7×21. */}
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center ${toneClass}`}>
          <Icon name={icon} size={24} className="text-current" />
        </span>
        <span className={`min-w-0 flex-1 ${danger ? "text-call-red" : "text-text-primary"}`}>
          {label}
        </span>
      </button>
    );
  },
);

export const RightPanelUserProfileEditAvatarDialog: React.FC<
  RightPanelUserProfileEditAvatarDialogProps
> = ({
  open,
  onOpenChange,
  hasAvatar,
  busy = false,
  error = null,
  // Keep the callback in the contract while the camera action is hidden.
  onChooseFromGallery,
  onRemoveCurrentPhoto,
}) => {
  return (
    <AppDialogShell open={open} onOpenChange={onOpenChange} contentClassName={CONTENT_CLASS}>
      {/* a11y: в макете нет видимого title — скрытый для скринридеров */}
      <Dialog.Title className="sr-only">{t("settings.changeAvatar")}</Dialog.Title>
      <Dialog.Description className="sr-only">{t("settings.changeAvatar")}</Dialog.Description>

      {/* Outer pad 12×20; между блоком actions и Cancel — 20px. */}
      <div className="flex flex-col gap-5 px-3 py-5" data-testid="right-panel-edit-avatar-dialog">
        {/* Restore the camera action here when taking photos is supported. */}
        <div className="flex flex-col gap-2">
          <AvatarActionRow
            icon="images"
            label={t("settings.chooseFromGallery")}
            onClick={onChooseFromGallery}
            disabled={busy}
            testId="right-panel-edit-avatar-choose-gallery"
          />
          <AvatarActionRow
            icon="delete"
            label={t("settings.removeCurrentPhoto")}
            onClick={onRemoveCurrentPhoto}
            disabled={busy || !hasAvatar}
            danger
            testId="right-panel-edit-avatar-remove"
          />
        </div>

        {error != null && error.length > 0 && (
          <p className="text-xs text-danger" data-testid="right-panel-edit-avatar-error">
            {error}
          </p>
        )}

        <Dialog.Close asChild>
          <button
            type="button"
            disabled={busy}
            className={CANCEL_BUTTON_CLASS}
            data-testid="right-panel-edit-avatar-cancel"
          >
            {t("common.cancel")}
          </button>
        </Dialog.Close>
      </div>
    </AppDialogShell>
  );
};
