import React from "react";
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
  onCreateCallLink,
  onCancelUpload,
  activeTopic,
  replyQuote,
  onClearReply,
  draftInitialValue,
  onComposerValueChange,
  onEditLastMessage,
  editSession,
  onSubmitEdit,
  onCancelEdit,
  composerCapabilities,
  aiMessagesContext,
  aiChatContext,
  readOnlyReason,
}: ChatPageComposerSectionProps) {
  // Старый read-only режим оставлен для legacy-сценариев.
  // Workspace-путь вместо него передаёт capabilities: UI тот же, но запрещённые действия получают заглушку.
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
          customEmojis: { mode: "unsupported" as const, unsupportedText: readOnlyReason },
        });

  if (readOnlyReason != null) {
    return (
      <MessageComposer
        onSend={onSend}
        onCreateCallLink={undefined}
        onCancelUpload={onCancelUpload}
        disabled
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

  return (
    <MessageComposer
      onSend={onSend}
      onCreateCallLink={onCreateCallLink}
      onCancelUpload={onCancelUpload}
      disabled={isComposerDisabled({
        dmPartnerDeactivated,
        isDmView,
        activeDmUserIds,
        activeStream,
      })}
      uploadProgress={uploadProgress}
      placeholder={placeholder}
      activeTopic={activeTopic ?? undefined}
      replyQuote={replyQuote}
      onClearReply={onClearReply}
      initialValue={draftInitialValue}
      onValueChange={onComposerValueChange}
      onEditLastMessage={onEditLastMessage}
      editSession={editSession}
      onSubmitEdit={onSubmitEdit}
      onCancelEdit={onCancelEdit}
      capabilities={effectiveComposerCapabilities}
      aiMessagesContext={aiMessagesContext}
      aiChatContext={aiChatContext}
    />
  );
});
