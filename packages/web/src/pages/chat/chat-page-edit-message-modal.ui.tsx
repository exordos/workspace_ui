import * as Dialog from "@radix-ui/react-dialog";
import React, { useState } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { EditMessageModalBodyProps } from "./chat-page.types";

export const EditMessageModalBody = React.memo<EditMessageModalBodyProps>(function EditMessageModalBody({
  initialContent,
  onSave,
  onClose,
}) {
  const [content, setContent] = useState(initialContent);
  return (
    <>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <Dialog.Title className="text-sm font-semibold text-text-primary">
          {t("message.edit")}
        </Dialog.Title>
        <Dialog.Close asChild>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-bg/50 rounded p-1 text-text-muted"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[120px] w-full flex-1 resize-none rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          placeholder={t("message.editPlaceholder")}
        />
        <div className="flex justify-end gap-2">
          <Dialog.Close asChild>
            <button
              type="button"
              onClick={onClose}
              className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
            >
              {t("common.cancel")}
            </button>
          </Dialog.Close>
          <button
            type="button"
            onClick={() => onSave(content)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </>
  );
});
