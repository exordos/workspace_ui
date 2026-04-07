import * as Dialog from "@radix-ui/react-dialog";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import React from "react";
import { STATUS_EMOJI_PRESETS } from "./right-panel-user-menu-constants.lib";
import type { ComponentProps } from "react";

export interface RightPanelUserMenuStatusDialogProps {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  closeStatusDialog: () => void;
  statusEmojiPickerOpen: boolean;
  setStatusEmojiPickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  statusEmojiNameDraft: string;
  setStatusEmojiNameDraft: (value: string) => void;
  statusEmojiCodeDraft: string;
  setStatusEmojiCodeDraft: (value: string) => void;
  statusTextDraft: string;
  setStatusTextDraft: (value: string) => void;
  statusAwayDraft: boolean;
  setStatusAwayDraft: (value: boolean) => void;
  statusSubmitting: boolean;
  selectedStatusEmoji: string | null;
  statusEmojiPickerTheme: NonNullable<ComponentProps<typeof EmojiPicker>["theme"]>;
  t: (key: string, options?: Record<string, string | number>) => string;
  handleStatusEmojiPick: (data: EmojiClickData) => void;
  clearStatusDraft: () => void;
  handleSaveStatus: () => Promise<void>;
}

export const RightPanelUserMenuStatusDialog: React.FC<RightPanelUserMenuStatusDialogProps> = ({
  open,
  onOpenChange,
  closeStatusDialog,
  statusEmojiPickerOpen,
  setStatusEmojiPickerOpen,
  statusEmojiNameDraft,
  setStatusEmojiNameDraft,
  statusEmojiCodeDraft: _statusEmojiCodeDraft,
  setStatusEmojiCodeDraft,
  statusTextDraft,
  setStatusTextDraft,
  statusAwayDraft,
  setStatusAwayDraft,
  statusSubmitting,
  selectedStatusEmoji,
  statusEmojiPickerTheme,
  t,
  handleStatusEmojiPick,
  clearStatusDraft,
  handleSaveStatus,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
          <div className="border-b border-border-subtle px-5 py-4">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              {t("settings.status")}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-text-muted">
              {t("settings.statusDialogHint")}
            </Dialog.Description>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_EMOJI_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setStatusEmojiNameDraft(preset.name);
                    setStatusEmojiCodeDraft(preset.code);
                    setStatusEmojiPickerOpen(false);
                  }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-base transition-colors ${
                    statusEmojiNameDraft === preset.name
                      ? "bg-accent/15 border-accent"
                      : "border-border-subtle bg-bg hover:bg-bg-elevated"
                  }`}
                  aria-label={`${t("settings.status")} ${preset.symbol}`}
                >
                  {preset.symbol}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStatusEmojiPickerOpen((o) => !o)}
                className={`inline-flex h-9 items-center rounded-md border px-2.5 text-xs font-medium transition-colors ${
                  statusEmojiPickerOpen
                    ? "bg-accent/15 border-accent text-text-primary"
                    : "border-border-subtle bg-bg text-text-primary hover:bg-bg-elevated"
                }`}
                aria-label={t("settings.statusChooseEmoji")}
              >
                {t("settings.statusChooseEmoji")}
              </button>
            </div>

            {statusEmojiPickerOpen && (
              <div className="overflow-hidden rounded-lg border border-border-subtle">
                <EmojiPicker
                  onEmojiClick={handleStatusEmojiPick}
                  searchDisabled={false}
                  skinTonesDisabled
                  width="100%"
                  height={320}
                  lazyLoadEmojis
                  theme={statusEmojiPickerTheme}
                />
              </div>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block text-text-muted">{t("settings.status")}</span>
              <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg px-3 py-2">
                <span className="text-base">{selectedStatusEmoji ?? "🙂"}</span>
                <input
                  type="text"
                  value={statusTextDraft}
                  onChange={(event) => setStatusTextDraft(event.target.value.slice(0, 60))}
                  placeholder={t("settings.statusPlaceholder")}
                  aria-label={t("settings.status")}
                  className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={statusAwayDraft}
                onChange={(event) => setStatusAwayDraft(event.target.checked)}
                className="h-4 w-4 rounded border-border-subtle bg-bg accent-accent"
              />
              <span>{t("settings.statusAwayToggle")}</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-3">
            <button
              type="button"
              onClick={clearStatusDraft}
              className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg"
              disabled={statusSubmitting}
            >
              {t("settings.statusClear")}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeStatusDialog}
                className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg"
                disabled={statusSubmitting}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveStatus();
                }}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-60"
                disabled={statusSubmitting}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
