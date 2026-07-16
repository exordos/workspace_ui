/**
 * Outgoing message send, retry, and upload cancellation for the chat page.
 */
import { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { sendMessage } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { createMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
} from "./chat-send-delivery.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");

export interface UseChatPageSendMessageParams {
  currentUserId: UserId | null;
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStream: string | null;
  activeStreamCanonicalName: string | null;
  activeStreamId: string | null | undefined;
  activeStreamUuid: string | null | undefined;
  activeTopic: string | null | undefined;
  activeTopicUuid: string | null | undefined;
  appendMessage: (message: MockMessage) => void;
  commitOutgoingMessage: (optimisticId: MessageId, message: MockMessage) => void;
  removeMessage: (messageId: MessageId) => void;
  clearReplyQuote: () => void;
  stopTyping: () => void;
  setSendError: (message: string | null) => void;
  setUploadProgress: (progress: ComposerUploadProgressState | null) => void;
}

export interface UseChatPageSendMessageResult {
  handleSend: (content: string, subjectOverride?: string, files?: File[]) => Promise<void>;
  handleRetryFailedOutgoing: (msg: MockMessage) => Promise<void>;
  handleRemoveFailedOutgoing: (msg: MockMessage) => void;
  handleCancelUpload: () => void;
}

export function useChatPageSendMessage(
  params: UseChatPageSendMessageParams,
): UseChatPageSendMessageResult {
  const {
    currentUserId,
    isDmView,
    activeDmUserIds,
    activeStream,
    activeStreamCanonicalName,
    activeStreamId,
    activeStreamUuid,
    activeTopic,
    activeTopicUuid,
    appendMessage,
    commitOutgoingMessage,
    removeMessage,
    clearReplyQuote,
    stopTyping,
    setSendError,
    setUploadProgress,
  } = params;

  const uploadAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current = null;
    };
  }, []);

  const handleSend = useCallback(
    async (content: string, subjectOverride?: string, files?: File[]) => {
      await executeChatPageSend(
        {
          currentUserId,
          isDmView,
          activeDmUserIds,
          activeStream,
          activeStreamCanonicalName,
          activeStreamId,
          activeStreamUuid,
          activeTopic,
          activeTopicUuid,
          allocateOptimisticMessageId: createMessageId,
          appendMessage,
          commitOutgoingMessage,
          clearReplyQuote,
          stopTyping,
          setSendError,
          setUploadProgress,
          setUploadAbortController: (controller) => {
            uploadAbortControllerRef.current = controller;
          },
          releaseUploadAbortController: (controller) => {
            if (uploadAbortControllerRef.current === controller) {
              uploadAbortControllerRef.current = null;
            }
          },
        },
        content,
        subjectOverride,
        files,
      );
    },
    [
      currentUserId,
      isDmView,
      activeDmUserIds,
      activeStream,
      activeStreamCanonicalName,
      activeStreamId,
      activeStreamUuid,
      activeTopic,
      activeTopicUuid,
      appendMessage,
      commitOutgoingMessage,
      clearReplyQuote,
      stopTyping,
      setSendError,
      setUploadProgress,
    ],
  );

  const handleRemoveFailedOutgoing = useCallback(
    (msg: MockMessage) => {
      if (msg.delivery_status !== "failed") return;
      removeMessage(msg.id);
      setSendError(null);
    },
    [removeMessage, setSendError],
  );

  const handleRetryFailedOutgoing = useCallback(
    async (msg: MockMessage) => {
      if (msg.delivery_status !== "failed") return;
      setSendError(null);
      const body = msg.content;
      removeMessage(msg.id);

      const stopTypingAfterSend = () => {
        stopTyping();
      };

      if (isDmView && activeStreamUuid != null) {
        const optimisticMessageId = msg.id;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId,
          senderFullName: t("common.you"),
          content: body,
          target: { mode: "dm", recipientIds: activeDmUserIds ?? [] },
        });
        appendMessage(optimisticMessage);
        try {
          const newMsg = await sendMessage({
            messageUuid: optimisticMessageId,
            streamUuid: activeStreamUuid,
            content: body,
            ...(currentUserId != null ? { author_id: currentUserId } : {}),
            sender_full_name: t("common.you"),
          });
          commitOutgoingMessage(optimisticMessageId, newMsg);
          clearReplyQuote();
          stopTypingAfterSend();
        } catch (err) {
          removeMessage(optimisticMessageId);
          appendMessage(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
        return;
      }
      if (activeStream) {
        if (!activeStreamCanonicalName || activeStreamUuid == null) {
          log.warn(
            "Blocked retry for failed stream message without canonical stream name or stream uuid",
            {
              streamId: activeStreamId ?? undefined,
              displayName: activeStream,
              failedMessageId: msg.id,
              hasStreamUuid: activeStreamUuid != null,
            },
          );
          setSendError(t("message.sendFailed"));
          return;
        }
        const subject = normalizeTopicForIdentity(msg.subject ?? activeTopic ?? "");
        const optimisticMessageId = msg.id;
        const retryTopicUuid = msg.topic_uuid ?? activeTopicUuid ?? null;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId,
          senderFullName: t("common.you"),
          content: body,
          target: {
            mode: "stream",
            stream: activeStreamCanonicalName,
            streamUuid: activeStreamUuid,
            subject,
            ...(retryTopicUuid != null ? { topicUuid: retryTopicUuid } : {}),
          },
        });
        appendMessage(optimisticMessage);
        try {
          const newMsg = await sendMessage({
            messageUuid: optimisticMessageId,
            stream: activeStreamCanonicalName,
            streamUuid: activeStreamUuid,
            ...(retryTopicUuid != null ? { topicUuid: retryTopicUuid } : {}),
            subject,
            content: body,
            ...(currentUserId != null ? { author_id: currentUserId } : {}),
            sender_full_name: t("common.you"),
          });
          commitOutgoingMessage(optimisticMessageId, newMsg);
          clearReplyQuote();
          stopTypingAfterSend();
        } catch (err) {
          removeMessage(optimisticMessageId);
          appendMessage(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
      }
    },
    [
      activeDmUserIds,
      activeStream,
      activeStreamCanonicalName,
      activeStreamId,
      activeStreamUuid,
      activeTopic,
      activeTopicUuid,
      appendMessage,
      clearReplyQuote,
      commitOutgoingMessage,
      currentUserId,
      isDmView,
      removeMessage,
      setSendError,
      setUploadProgress,
      stopTyping,
    ],
  );

  const handleCancelUpload = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    if (controller == null || controller.signal.aborted) return;
    controller.abort();
  }, []);

  return {
    handleSend,
    handleRetryFailedOutgoing,
    handleRemoveFailedOutgoing,
    handleCancelUpload,
  };
}
