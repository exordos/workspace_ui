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

interface RetryFailedOutgoingContext {
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

function retryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t("message.sendFailed");
}

async function retryFailedDmMessage(
  context: RetryFailedOutgoingContext,
  failedMessage: MockMessage,
): Promise<boolean> {
  if (!context.isDmView || context.activeStreamUuid == null) return false;
  const optimisticMessage = buildOptimisticOutgoingMessage({
    id: failedMessage.id,
    senderId: context.currentUserId,
    senderFullName: t("common.you"),
    content: failedMessage.content,
    target: { mode: "dm", recipientIds: context.activeDmUserIds ?? [] },
  });
  context.appendMessage(optimisticMessage);
  try {
    const newMessage = await sendMessage({
      messageUuid: failedMessage.id,
      streamUuid: context.activeStreamUuid,
      content: failedMessage.content,
      ...(context.currentUserId != null ? { author_id: context.currentUserId } : {}),
      sender_full_name: t("common.you"),
    });
    context.commitOutgoingMessage(failedMessage.id, newMessage);
    context.clearReplyQuote();
    context.stopTyping();
  } catch (error) {
    context.removeMessage(failedMessage.id);
    context.appendMessage(markOutgoingMessageFailed(optimisticMessage));
    context.setSendError(retryErrorMessage(error));
  } finally {
    context.setUploadProgress(null);
  }
  return true;
}

async function retryFailedStreamMessage(
  context: RetryFailedOutgoingContext,
  failedMessage: MockMessage,
): Promise<void> {
  if (!context.activeStream) return;
  if (!context.activeStreamCanonicalName || context.activeStreamUuid == null) {
    log.warn(
      "Blocked retry for failed stream message without canonical stream name or stream uuid",
      {
        streamId: context.activeStreamId ?? undefined,
        displayName: context.activeStream,
        failedMessageId: failedMessage.id,
        hasStreamUuid: context.activeStreamUuid != null,
      },
    );
    context.setSendError(t("message.sendFailed"));
    return;
  }
  const subject = normalizeTopicForIdentity(failedMessage.subject ?? context.activeTopic ?? "");
  const retryTopicUuid = failedMessage.topic_uuid ?? context.activeTopicUuid ?? null;
  const optimisticMessage = buildOptimisticOutgoingMessage({
    id: failedMessage.id,
    senderId: context.currentUserId,
    senderFullName: t("common.you"),
    content: failedMessage.content,
    target: {
      mode: "stream",
      stream: context.activeStreamCanonicalName,
      streamUuid: context.activeStreamUuid,
      subject,
      ...(retryTopicUuid != null ? { topicUuid: retryTopicUuid } : {}),
    },
  });
  context.appendMessage(optimisticMessage);
  try {
    const newMessage = await sendMessage({
      messageUuid: failedMessage.id,
      stream: context.activeStreamCanonicalName,
      streamUuid: context.activeStreamUuid,
      ...(retryTopicUuid != null ? { topicUuid: retryTopicUuid } : {}),
      subject,
      content: failedMessage.content,
      ...(context.currentUserId != null ? { author_id: context.currentUserId } : {}),
      sender_full_name: t("common.you"),
    });
    context.commitOutgoingMessage(failedMessage.id, newMessage);
    context.clearReplyQuote();
    context.stopTyping();
  } catch (error) {
    context.removeMessage(failedMessage.id);
    context.appendMessage(markOutgoingMessageFailed(optimisticMessage));
    context.setSendError(retryErrorMessage(error));
  } finally {
    context.setUploadProgress(null);
  }
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
      removeMessage(msg.id);
      const context: RetryFailedOutgoingContext = {
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
      };
      if (await retryFailedDmMessage(context, msg)) return;
      await retryFailedStreamMessage(context, msg);
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
