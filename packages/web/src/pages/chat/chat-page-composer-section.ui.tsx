import React from "react";
import { WorkspaceReplyTabs } from "~/features/workspace-reply/workspace-reply.ui";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { MessageComposer } from "~/widgets/message-composer/message-composer.ui";
import { isComposerDisabled, resolveComposerPlaceholder } from "./chat-page-composer-section.lib";
import {
  TOPIC_PROMPT_BUTTON_CLASS_NAME,
  TOPIC_PROMPT_ICON_HOVER_MODE,
} from "./chat-topic-prompt-button.lib";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";

export const ChatPageComposerSection = React.memo(function ChatPageComposerSection({
  isDmView,
  activeDmUserIds,
  dmPartnerDeactivated = false,
  activeStream,
  showTopicPrompt,
  streamSlug,
  onExpandStreamTopics,
  uploadProgress,
  onSend,
  optimisticClearOnSend,
  attachments,
  attachmentsBlockSend,
  onAddAttachments,
  onRemoveAttachment,
  onRetryAttachment,
  onCreateCallLink,
  onCancelUpload,
  activeTopic,
  replyQuote,
  onClearReply,
  workspaceReplySession,
  onSelectWorkspaceReplyTab,
  onRemoveWorkspaceReplyTab,
  onReorderWorkspaceReplyTab,
  outgoingBodyOverride,
  allowEmptyActiveValueSend = false,
  focusKey,
  draftSessionKey,
  draftInitialValue,
  onComposerValueChange,
  onEditLastMessage,
  editSession,
  onSubmitEdit,
  onCancelEdit,
  composerCapabilities,
  resolveMention,
  onLoadWorkspaceFilePreview,
  aiMessagesContext,
  aiChatContext,
  readOnlyReason,
  joinedTop = false,
}: ChatPageComposerSectionProps) {
  // The old read-only mode remains for legacy scenarios.
  // The Workspace path passes capabilities instead: the UI is the same, but blocked actions get placeholders.
  const effectiveComposerCapabilities =
    composerCapabilities ??
    (readOnlyReason == null
      ? undefined
      : {
          upload: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
          savedSnippets: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
          preview: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
          mentions: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
          scheduledSend: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
        });

  if (readOnlyReason != null) {
    return (
      <MessageComposer
        onSend={onSend}
        optimisticClearOnSend={optimisticClearOnSend}
        attachments={attachments}
        attachmentsBlockSend={attachmentsBlockSend}
        onAddAttachments={onAddAttachments}
        onRemoveAttachment={onRemoveAttachment}
        onRetryAttachment={onRetryAttachment}
        onCreateCallLink={undefined}
        onCancelUpload={onCancelUpload}
        disabled
        joinedTop={joinedTop}
        uploadProgress={uploadProgress}
        placeholder={readOnlyReason}
        activeTopic={activeTopic ?? undefined}
        replyQuote={null}
        onClearReply={onClearReply}
        initialValue={undefined}
        onValueChange={onComposerValueChange}
        onEditLastMessage={onEditLastMessage}
        editSession={null}
        onSubmitEdit={onSubmitEdit}
        onCancelEdit={onCancelEdit}
        capabilities={effectiveComposerCapabilities}
        resolveMention={resolveMention}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
        aiMessagesContext={[]}
        aiChatContext={undefined}
      />
    );
  }

  if (showTopicPrompt) {
    return (
      <button
        type="button"
        onClick={onExpandStreamTopics}
        disabled={!streamSlug}
        data-icon-hover={TOPIC_PROMPT_ICON_HOVER_MODE}
        className={TOPIC_PROMPT_BUTTON_CLASS_NAME}
        aria-label={t("chat.selectTopic")}
      >
        <span className="mr-2 inline-flex align-middle">
          <Icon name="marker" size={20} className="text-current" />
        </span>
        <span>{t("chat.selectTopic")}</span>
      </button>
    );
  }

  const placeholder = resolveComposerPlaceholder({
    dmPartnerDeactivated,
    isDmView,
    activeDmUserIds,
    activeStream,
  });

  const showWorkspaceReplyTabs =
    (editSession == null || editSession.preserveWorkspaceReplyContext === true) &&
    workspaceReplySession != null &&
    workspaceReplySession.tabs.length > 1 &&
    onSelectWorkspaceReplyTab != null &&
    onRemoveWorkspaceReplyTab != null &&
    onReorderWorkspaceReplyTab != null;

  return (
    <MessageComposer
      onSend={onSend}
      optimisticClearOnSend={optimisticClearOnSend}
      attachments={attachments}
      attachmentsBlockSend={attachmentsBlockSend}
      onAddAttachments={onAddAttachments}
      onRemoveAttachment={onRemoveAttachment}
      onRetryAttachment={onRetryAttachment}
      onCreateCallLink={onCreateCallLink}
      onCancelUpload={onCancelUpload}
      disabled={isComposerDisabled({
        dmPartnerDeactivated,
        isDmView,
        activeDmUserIds,
        activeStream,
      })}
      joinedTop={joinedTop}
      uploadProgress={uploadProgress}
      placeholder={placeholder}
      activeTopic={activeTopic ?? undefined}
      replyQuote={replyQuote}
      onClearReply={onClearReply}
      leadingContent={
        showWorkspaceReplyTabs ? (
          <WorkspaceReplyTabs
            session={workspaceReplySession}
            onSelect={onSelectWorkspaceReplyTab}
            onRemove={onRemoveWorkspaceReplyTab}
            onReorder={onReorderWorkspaceReplyTab}
          />
        ) : null
      }
      outgoingBodyOverride={outgoingBodyOverride}
      allowEmptyActiveValueSend={allowEmptyActiveValueSend}
      focusKey={focusKey}
      draftSessionKey={draftSessionKey}
      initialValue={draftInitialValue}
      onValueChange={onComposerValueChange}
      onEditLastMessage={onEditLastMessage}
      editSession={editSession}
      onSubmitEdit={onSubmitEdit}
      onCancelEdit={onCancelEdit}
      capabilities={effectiveComposerCapabilities}
      resolveMention={resolveMention}
      onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      aiMessagesContext={aiMessagesContext}
      aiChatContext={aiChatContext}
    />
  );
});
