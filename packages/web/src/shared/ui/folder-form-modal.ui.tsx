import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import {
  FOLDER_COLOR_PRESETS,
  folderColorValueToCssHex,
  folderColorValueToCssRgba,
} from "~/shared/lib/folder-colors.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import type { FolderFormModalProps } from "./folder-form-modal.types";

export const FolderFormModal: React.FC<FolderFormModalProps> = ({
  mode,
  open,
  onOpenChange,
  initialName = "",
  initialBackgroundColor,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);
  const [backgroundColor, setBackgroundColor] = useState(
    initialBackgroundColor ?? FOLDER_COLOR_PRESETS[0]!,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const defaultColor = FOLDER_COLOR_PRESETS[0]!;
  const resolvedInitialColor = initialBackgroundColor ?? defaultColor;

  useEffect(() => {
    if (!open) {
      if (mode === "create") {
        setName("");
        setBackgroundColor(defaultColor);
      }
      setIsSubmitting(false);
      return;
    }
    setName(initialName);
    setBackgroundColor(resolvedInitialColor);
    setIsSubmitting(false);
  }, [open, mode, initialName, resolvedInitialColor, defaultColor]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    if (
      mode === "edit" &&
      trimmed === initialName.trim() &&
      backgroundColor === resolvedInitialColor
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = await onSubmit({ name: trimmed, backgroundColor });
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    name,
    backgroundColor,
    isSubmitting,
    mode,
    initialName,
    resolvedInitialColor,
    onSubmit,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const title = mode === "create" ? t("folder.createFolder") : t("folder.renameFolder");
  const submitLabel = mode === "create" ? t("common.create") : t("common.save");
  const noChanges =
    mode === "edit" &&
    name.trim() === initialName.trim() &&
    backgroundColor === resolvedInitialColor;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidthClassName="max-w-modal-manage-folder"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={submitLabel}
          onCancel={() => onOpenChange(false)}
          onSubmit={() => {
            void handleSubmit();
          }}
          submitDisabled={!name.trim() || noChanges}
          isSubmitting={isSubmitting}
        />
      }
    >
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

      <div className="space-y-2">
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
                  selected ? "border-text-primary ring-2 ring-accent-soft" : "border-border-subtle"
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
    </AppDialog>
  );
};
