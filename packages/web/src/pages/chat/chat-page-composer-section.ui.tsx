import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { MessageComposer } from "~/widgets/message-composer/message-composer.ui";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import type { ComposerUploadProgressState } from "./chat-upload.lib";
import {
  TOPIC_PROMPT_BUTTON_CLASS_NAME,
  TOPIC_PROMPT_ICON_HOVER_MODE,
} from "./chat-topic-prompt-button.lib";

export interface ChatPageComposerSectionProps {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null | undefined;
  showTopicPrompt: boolean;
  streamSlug: string | undefined;
  onExpandStreamTopics: () => void;
  sending: boolean;
  uploadProgress: ComposerUploadProgressState | null;
  onSend: (
    content: string,
    subjectOverride?: string,
    files?: File[],
  ) => void | Promise<void>;
  onCreateCallLink: (() => string | null) | undefined;
  onCancelUpload: () => void;
  activeTopic: string | null | undefined;
  replyQuote: {
    id: number;
    content: string;
    sender_full_name: string;
  } | null;
  onClearReply: () => void;
  draftInitialValue: string | undefined;
  onComposerValueChange: (v: string) => void;
  onEditLastMessage: () => void;
  aiMessagesContext: AiMessageContext[];
  aiChatContext: AiReplyRequest["chatContext"] | undefined;
}

export const ChatPageComposerSection = React.memo(function ChatPageComposerSection({
  isDmView,
  activeDmUserIds,
  activeStream,
  showTopicPrompt,
  streamSlug,
  onExpandStreamTopics,
  sending,
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
  aiMessagesContext,
  aiChatContext,
}: ChatPageComposerSectionProps) {
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

  const placeholder = isDmView
    ? activeDmUserIds?.length
      ? t("chat.sendPlaceholder")
      : t("chat.selectChat")
    : activeStream
      ? t("chat.sendPlaceholder")
      : t("chat.selectChannel");

  return (
    <MessageComposer
      onSend={onSend}
      onCreateCallLink={onCreateCallLink}
      onCancelUpload={onCancelUpload}
      disabled={sending || (isDmView ? !activeDmUserIds?.length : !activeStream)}
      uploadProgress={uploadProgress}
      placeholder={placeholder}
      activeTopic={activeTopic ?? undefined}
      replyQuote={replyQuote}
      onClearReply={onClearReply}
      initialValue={draftInitialValue}
      onValueChange={onComposerValueChange}
      onEditLastMessage={onEditLastMessage}
      aiMessagesContext={aiMessagesContext}
      aiChatContext={aiChatContext}
    />
  );
});
