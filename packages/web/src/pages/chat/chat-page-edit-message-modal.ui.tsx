import * as Dialog from "@radix-ui/react-dialog";
import React, { useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { fetchMessageById } from "~/shared/api/zulip";
import { createLogger } from "~/shared/lib/logger";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import { Icon } from "~/shared/ui/icon";
import type { EditMessageModalBodyProps } from "./chat-page.types";

const log = createLogger("ui:editMessageModal");

export const EditMessageModalBody = React.memo<EditMessageModalBodyProps>(function EditMessageModalBody({
  message,
  onSave,
  onClose,
}) {
  const [markdown, setMarkdown] = useState(() => {
    const fromSource = message.markdown_source?.trim();
    if (fromSource != null && fromSource.length > 0) return fromSource;
    const body = message.content.trim();
    if (body.length > 0 && !isLikelyRenderedMessageHtml(body)) return body;
    return "";
  });
  const [loading, setLoading] = useState(() => {
    const fromSource = message.markdown_source?.trim();
    if (fromSource != null && fromSource.length > 0) return false;
    const body = message.content.trim();
    if (body.length > 0 && !isLikelyRenderedMessageHtml(body)) return false;
    return true;
  });

  useEffect(() => {
    const seed = message.markdown_source?.trim();
    if (seed != null && seed.length > 0) {
      setMarkdown(seed);
      setLoading(false);
      return;
    }
    const body = message.content.trim();
    if (body.length > 0 && !isLikelyRenderedMessageHtml(body)) {
      setMarkdown(body);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMarkdown("");
    void fetchMessageById(message.id).then((m) => {
      if (cancelled) return;
      if (m?.markdown_source != null && m.markdown_source.trim().length > 0) {
        setMarkdown(m.markdown_source.trim());
      } else {
        log.warn("edit modal: no markdown_source from API", { messageId: message.id });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.markdown_source, message.content]);

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
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          disabled={loading}
          aria-busy={loading}
          className="min-h-[120px] w-full flex-1 resize-none rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
          placeholder={loading ? t("message.editLoadingMarkdown") : t("message.editPlaceholder")}
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
            disabled={loading}
            onClick={() => onSave(markdown)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </>
  );
});
