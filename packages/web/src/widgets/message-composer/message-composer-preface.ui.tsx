import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import {
  CHAT_BOTTOM_NOTICE_DISMISS_BUTTON_CLASS_NAME,
  CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME,
  CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X,
  chatBottomNoticeBarClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { AttachmentCard, AttachmentCardList } from "~/shared/ui/attachment-card.ui";
import { Icon } from "~/shared/ui/icon";
import { WorkspaceMessageQuoteFrame } from "~/shared/ui/workspace-message-quote-frame.ui";
import {
  formatAttachmentSize,
  formatScheduledTimestamp,
  getAttachmentExtensionLabel,
} from "./message-composer-body.lib";
import { QUOTE_PREVIEW_MAX } from "./message-composer-constants.lib";
import { MessageComposerControlledAttachmentCards } from "./message-composer-controlled-attachments.ui";
import type { MessageComposerPrefaceProps } from "./message-composer.types";

interface MessageComposerEditNoticeProps {
  onCancelEdit?: () => void;
  joinedTop?: boolean;
}

export const MessageComposerEditNotice: React.FC<MessageComposerEditNoticeProps> = React.memo(
  ({ onCancelEdit, joinedTop = false }) => (
    <div
      className={chatBottomNoticeBarClassName({
        gap: "3",
        joinedAbove: joinedTop,
        joinedBelow: true,
      })}
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

function MessageComposerClearReplyButton({
  onClearReply,
}: Readonly<{ onClearReply?: () => void }>) {
  return (
    <button
      type="button"
      onClick={() => onClearReply?.()}
      className={CHAT_BOTTOM_NOTICE_DISMISS_BUTTON_CLASS_NAME}
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
    separateUploadProgress = false,
    files,
    filePreviewUrls,
    showFiles = true,
    isUploadInProgress,
    onCancelUpload,
    removeFile,
    attachments = [],
    onRemoveAttachment,
    onRetryAttachment,
    scheduledMessages,
    onCancelScheduled,
    replyQuote,
    onClearReply,
    replyLeadingContent = null,
    isEditing = false,
    showReplyWhileEditing = false,
    hideEditNotice = false,
    joinedTop = false,
    roundTop = false,
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
    const activeUploadFileName = uploadProgress?.activeFileName?.trim() ?? "";
    const activeUploadIndex = useMemo(() => {
      if (separateUploadProgress || !isUploadInProgress || files.length === 0) return -1;
      const activeFileName = uploadProgress?.activeFileName?.trim();
      if (activeFileName != null && activeFileName.length > 0) {
        const matchingIndex = files.findIndex((file) => file.name === activeFileName);
        if (matchingIndex >= 0) return matchingIndex;
      }
      return Math.min(Math.max(uploadProgress?.completed ?? 0, 0), files.length - 1);
    }, [
      files,
      isUploadInProgress,
      separateUploadProgress,
      uploadProgress?.activeFileName,
      uploadProgress?.completed,
    ]);
    const showDetachedUpload =
      isUploadInProgress &&
      activeUploadFileName.length > 0 &&
      (separateUploadProgress || !showFiles || activeUploadIndex < 0);
    const showDraftFiles = showFiles && files.length > 0;
    const showControlledAttachments = showFiles && attachments.length > 0;

    return (
      <>
        {isEditing && !hideEditNotice && (
          <MessageComposerEditNotice onCancelEdit={onCancelEdit} joinedTop={joinedTop} />
        )}

        {!isEditing && (showDetachedUpload || showDraftFiles || showControlledAttachments) && (
          <AttachmentCardList ariaLabel={t("attachmentCard.list")} className="px-2 pt-2">
            {showDetachedUpload ? (
              <AttachmentCard
                status="uploading"
                fileName={activeUploadFileName}
                progress={uploadProgressPercent}
                onCancel={onCancelUpload}
              />
            ) : null}
            {showDraftFiles &&
              files.map((file, i) => {
                const previewUrl = filePreviewUrls[i] ?? null;
                const metadata = {
                  formatLabel: getAttachmentExtensionLabel(file.name),
                  sizeLabel: formatAttachmentSize(file.size),
                };
                if (i === activeUploadIndex) {
                  return (
                    <AttachmentCard
                      key={`${file.name}-${i}`}
                      status="uploading"
                      fileName={file.name}
                      progress={uploadProgressPercent}
                      onCancel={onCancelUpload}
                    />
                  );
                }
                if (previewUrl != null) {
                  return (
                    <AttachmentCard
                      key={`${file.name}-${i}`}
                      status="image"
                      fileName={file.name}
                      previewUrl={previewUrl}
                      metadata={metadata}
                      onRemove={() => removeFile(i)}
                    />
                  );
                }
                return (
                  <AttachmentCard
                    key={`${file.name}-${i}`}
                    status="file"
                    fileName={file.name}
                    metadata={metadata}
                    onRemove={() => removeFile(i)}
                  />
                );
              })}
            {showControlledAttachments ? (
              <MessageComposerControlledAttachmentCards
                attachments={attachments}
                onRemoveAttachment={onRemoveAttachment}
                onRetryAttachment={onRetryAttachment}
              />
            ) : null}
          </AttachmentCardList>
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
          // Opaque chrome must own top radius: parent stays overflow-visible for popovers,
          // so without rounded-t-xl this strip paints sharp corners over the shell curve.
          <div
            data-composer-reply-chrome="true"
            className={`${CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME} ${
              roundTop ? "rounded-t-xl" : ""
            }`}
          >
            {replyLeadingContent != null ? (
              // Tabs + quote stay separate blocks; drop the under-tabs line and tighten spacing.
              <div
                className={`flex min-w-0 items-center gap-1.5 ${CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X} ${
                  replyQuote != null ? "pb-1 pt-2" : "py-2"
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
              <div
                className={`flex items-start gap-2 ${CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X} pb-1 pt-2`}
              >
                <div className="min-w-0 flex-1">
                  {/* Accent bar + header; composer surface so fill matches the card (not message soft fill). */}
                  <WorkspaceMessageQuoteFrame
                    className="my-0"
                    surface="composer"
                    data-composer-reply-quote="true"
                    header={`${t("message.replyTo")}: ${replyQuote.sender_full_name}`}
                  >
                    {replyQuotePreview.length > 0 ? (
                      <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-text-primary">
                        {replyQuotePreview}
                      </p>
                    ) : null}
                  </WorkspaceMessageQuoteFrame>
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
