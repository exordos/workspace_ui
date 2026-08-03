import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { chatBottomNoticeBarClassName } from "~/shared/lib/chat-bottom-notice-bar.lib";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { Icon } from "~/shared/ui/icon";
import {
  formatAttachmentSize,
  formatScheduledTimestamp,
  getAttachmentExtensionLabel,
} from "./message-composer-body.lib";
import { QUOTE_PREVIEW_MAX } from "./message-composer-constants.lib";
import type { MessageComposerPrefaceProps } from "./message-composer.types";

interface MessageComposerEditNoticeProps {
  onCancelEdit?: () => void;
}

export const MessageComposerEditNotice: React.FC<MessageComposerEditNoticeProps> = React.memo(
  ({ onCancelEdit }) => (
    <div
      className={chatBottomNoticeBarClassName({ gap: "3", round: "top" })}
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1 text-sm text-text-primary">{t("message.edit")}</span>
      <button
        type="button"
        onClick={() => onCancelEdit?.()}
        className="rounded-lg px-3 py-1 text-sm text-text-muted hover:text-text-primary"
      >
        {t("common.cancel")}
      </button>
    </div>
  ),
);

function MessageComposerClearReplyButton({ onClearReply }: { onClearReply?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => onClearReply?.()}
      className="shrink-0 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      aria-label={t("common.cancel")}
    >
      <Icon name="close" size={16} />
    </button>
  );
}

export const MessageComposerPreface: React.FC<MessageComposerPrefaceProps> = React.memo(
  ({
    uploadProgress,
    uploadProgressPercent,
    files,
    filePreviewUrls,
    showFiles = true,
    isUploadInProgress,
    onCancelUpload,
    removeFile,
    scheduledMessages,
    onCancelScheduled,
    replyQuote,
    onClearReply,
    replyLeadingContent = null,
    isEditing = false,
    showReplyWhileEditing = false,
    hideEditNotice = false,
    onCancelEdit,
  }) => {
    const replyQuotePreview = useMemo(() => {
      if (replyQuote == null) return "";
      return summarizeWorkspaceMessageMarkdown(replyQuote.content, {
        maxLength: QUOTE_PREVIEW_MAX,
        includeMediaLabel: true,
        includeAttachmentLabel: true,
        includeQuotePrefix: false,
      }).text.trim();
    }, [replyQuote]);

    const showReplyChrome =
      (!isEditing || showReplyWhileEditing) && (replyQuote != null || replyLeadingContent != null);
    const clearReplyOnTabsRow = replyLeadingContent != null;
    // Keep a visible dismiss when there is a quote, or when the parent wired onClearReply.
    const showClearReply = replyQuote != null || onClearReply != null;

    return (
      <>
        {isEditing && !hideEditNotice && <MessageComposerEditNotice onCancelEdit={onCancelEdit} />}

        {!isEditing && uploadProgress != null && uploadProgress.total > 0 && (
          <div className="px-4 pb-1 pt-2">
            <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
              <span>
                {t("composer.uploadingFilesProgress", {
                  completed: uploadProgress.completed,
                  total: uploadProgress.total,
                })}
              </span>
              <span>{uploadProgressPercent}%</span>
            </div>
            {uploadProgress.activeFileName != null && uploadProgress.activeFileName.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {uploadProgress.activeFileName}
              </p>
            )}
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-elevated"
              role="progressbar"
              aria-label={t("composer.uploadingFilesAriaLabel")}
              aria-valuemin={0}
              aria-valuemax={uploadProgress.total}
              aria-valuenow={uploadProgress.completed}
            >
              <div
                className="h-full bg-accent transition-[width] duration-200"
                style={{ width: `${uploadProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {!isEditing && showFiles && files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            {files.map((file, i) => {
              const previewUrl = filePreviewUrls[i] ?? null;
              const isImage = file.type.startsWith("image/");
              const canCancelUpload = isUploadInProgress && onCancelUpload != null;
              return (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 py-1 text-xs text-text-primary"
                >
                  {previewUrl != null ? (
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className="h-8 w-8 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-bg-elevated px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {getAttachmentExtensionLabel(file.name)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block max-w-[120px] truncate" title={file.name}>
                      {file.name}
                    </span>
                    {!isImage && (
                      <span className="block text-[10px] text-text-muted">
                        {formatAttachmentSize(file.size)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (canCancelUpload) {
                        onCancelUpload();
                        return;
                      }
                      removeFile(i);
                    }}
                    className="rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                    aria-label={canCancelUpload ? t("composer.cancelUpload") : t("common.delete")}
                    title={canCancelUpload ? t("composer.cancelUpload") : t("common.delete")}
                  >
                    <Icon
                      name="close"
                      size={12}
                      className={canCancelUpload ? "text-notice-base" : undefined}
                    />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {!isEditing && scheduledMessages.length > 0 && (
          <div className="px-4 pb-2">
            <div className="space-y-1 rounded-lg border border-border-subtle bg-bg px-2 py-2">
              {[...scheduledMessages]
                .sort((left, right) => left.sendAt - right.sendAt)
                .map((message) => (
                  <div
                    key={message.id}
                    className="flex items-center gap-2 rounded-md bg-bg-elevated px-2 py-1"
                  >
                    <Icon name="calendar" size={14} className="text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                      {formatScheduledTimestamp(message.sendAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCancelScheduled(message.id)}
                      className="rounded p-0.5 text-text-muted hover:bg-bg hover:text-text-primary"
                      aria-label={t("common.cancel")}
                      title={t("common.cancel")}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {showReplyChrome ? (
          <div className="bg-bg/50 border-b border-border-subtle">
            {replyLeadingContent != null ? (
              <div
                className={`flex min-w-0 items-center gap-1.5 px-3 py-2 ${
                  replyQuote != null ? "border-b border-border-subtle" : ""
                }`}
              >
                {/* Constrain width so tabs scroll inside; dismiss stays a sibling. */}
                <div className="min-w-0 flex-1 overflow-hidden">{replyLeadingContent}</div>
                {clearReplyOnTabsRow && showClearReply ? (
                  <MessageComposerClearReplyButton onClearReply={onClearReply} />
                ) : null}
              </div>
            ) : null}

            {replyQuote != null ? (
              <div className="flex items-start gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-muted">
                    {t("message.replyTo")}: {replyQuote.sender_full_name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-text-primary">
                    {replyQuotePreview}
                  </p>
                </div>
                {!clearReplyOnTabsRow && showClearReply ? (
                  <MessageComposerClearReplyButton onClearReply={onClearReply} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  },
);

MessageComposerPreface.displayName = "MessageComposerPreface";
