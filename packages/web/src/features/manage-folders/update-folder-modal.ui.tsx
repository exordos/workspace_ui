import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  FOLDER_COLOR_PRESETS,
  folderColorValueToCssHex,
  folderColorValueToCssRgba,
} from "./folder-colors";
import type { UpdateFolderModalProps } from "./update-folder-modal.types";

export const UpdateFolderModal: React.FC<UpdateFolderModalProps> = ({
  open,
  onOpenChange,
  initialName,
  initialBackgroundColor,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [backgroundColor, setBackgroundColor] = useState(
    initialBackgroundColor ?? FOLDER_COLOR_PRESETS[0]!,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setBackgroundColor(initialBackgroundColor ?? FOLDER_COLOR_PRESETS[0]!);
      setIsSubmitting(false);
    }
  }, [open, initialName, initialBackgroundColor]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    const initialColor = initialBackgroundColor ?? FOLDER_COLOR_PRESETS[0]!;
    const noChanges = trimmed === initialName && backgroundColor === initialColor;
    if (!trimmed || noChanges || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updated = await onSave({ name: trimmed, backgroundColor });
      if (updated) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    name,
    initialName,
    initialBackgroundColor,
    backgroundColor,
    isSubmitting,
    onSave,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        void handleSave();
      }
    },
    [handleSave],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-[20%] z-modal w-full max-w-modal-manage-folder -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-elevated p-6 shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-4 text-base font-semibold text-text-primary">
            {t("folder.renameFolder")}
          </Dialog.Title>

          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("folder.folderName")}
            className="mb-4 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
            disabled={isSubmitting}
          />

          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-text-muted">{t("folder.color")}</p>
            <div className="flex flex-wrap gap-2.5">
              {FOLDER_COLOR_PRESETS.map((color) => {
                const selected = color === backgroundColor;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackgroundColor(color)}
                    className={`h-9 w-9 rounded-full border transition-colors ${
                      selected
                        ? "border-text-primary ring-2 ring-accent-soft"
                        : "border-border-subtle"
                    }`}
                    style={{ backgroundColor: folderColorValueToCssHex(color) }}
                    aria-label={`${t("folder.color")} ${color}`}
                    aria-pressed={selected}
                  />
                );
              })}
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2"
              style={{ backgroundColor: folderColorValueToCssRgba(backgroundColor, 0.12) }}
            >
              <span
                className="inline-flex text-current"
                style={{ color: folderColorValueToCssHex(backgroundColor) }}
                aria-hidden
              >
                <Icon name="folder" size={16} className="text-current" />
              </span>
              <span className="text-xs text-text-muted">{name.trim() || t("folder.preview")}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="hover:bg-bg/60 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={
                isSubmitting ||
                !name.trim() ||
                (name.trim() === initialName &&
                  backgroundColor === (initialBackgroundColor ?? FOLDER_COLOR_PRESETS[0]!))
              }
              className="hover:bg-accent/90 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors disabled:opacity-50"
            >
              {isSubmitting && (
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
              )}
              {t("common.save")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
