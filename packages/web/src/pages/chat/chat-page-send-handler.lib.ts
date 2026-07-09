import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
  type OutgoingMessageTarget,
} from "./chat-send-delivery.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");

export interface ChatPageSendHandlerDeps {
  currentUserId: number | null;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null;
  activeStreamCanonicalName: string | null;
  activeStreamId: number | null | undefined;
  activeTopic: string | null | undefined;
  allocateOptimisticMessageId: () => number;
  appendMessage: (message: MockMessage) => void;
  commitOutgoingMessage: (optimisticId: number, message: MockMessage) => void;
  requestScrollToBottom: () => void;
  clearReplyQuote: () => void;
  stopTyping: () => void;
  setSendError: (message: string | null) => void;
  setUploadProgress: (progress: ComposerUploadProgressState | null) => void;
  setUploadAbortController: (controller: AbortController | null) => void;
  releaseUploadAbortController: (controller: AbortController) => void;
}

function prepareComposerBodyWithUploads(options: {
  content: string;
  files: File[] | undefined;
  setUploadProgress: ChatPageSendHandlerDeps["setUploadProgress"];
  setSendError: ChatPageSendHandlerDeps["setSendError"];
}): Promise<string> {
  const { content, files, setUploadProgress, setSendError } = options;
  if (files == null || files.length === 0) return Promise.resolve(content);

  const errorMessage = t("message.fileUploadUnsupported");
  setSendError(errorMessage);
  setUploadProgress(null);
  throw new Error(errorMessage);
}

function sendOutgoingMessageWithOptimisticUi(options: {
  deps: ChatPageSendHandlerDeps;
  body: string;
  target: OutgoingMessageTarget;
}): Promise<void> {
  const { deps, body, target } = options;
  const optimisticMessageId = deps.allocateOptimisticMessageId();
  const optimisticMessage = buildOptimisticOutgoingMessage({
    id: optimisticMessageId,
    senderId: deps.currentUserId ?? 0,
    senderFullName: t("common.you"),
    content: body,
    target,
  });

  deps.appendMessage(markOutgoingMessageFailed(optimisticMessage));
  deps.requestScrollToBottom();
  const error = t("message.sendFailed");
  deps.setSendError(error);
  deps.setUploadProgress(null);
  return Promise.reject(new Error(error));
}

/** Sends composer content (optional file uploads) to the active DM or stream narrow. */
export async function executeChatPageSend(
  deps: ChatPageSendHandlerDeps,
  content: string,
  subjectOverride?: string,
  files?: File[],
): Promise<void> {
  deps.setSendError(null);
  deps.setUploadProgress(null);

  const body = await prepareComposerBodyWithUploads({
    content,
    files,
    setUploadProgress: deps.setUploadProgress,
    setSendError: deps.setSendError,
  });

  if (deps.isDmView && deps.activeDmUserIds != null && deps.activeDmUserIds.length > 0) {
    await sendOutgoingMessageWithOptimisticUi({
      deps,
      body,
      target: { mode: "dm", recipientIds: deps.activeDmUserIds },
    });
    return;
  }

  if (deps.activeStream == null) {
    deps.setUploadProgress(null);
    return;
  }

  if (deps.activeStreamCanonicalName == null) {
    log.warn("Blocked stream send without canonical stream name", {
      streamId: deps.activeStreamId ?? undefined,
      displayName: deps.activeStream,
    });
    const error = t("message.sendFailed");
    deps.setSendError(error);
    deps.setUploadProgress(null);
    throw new Error(error);
  }

  const subject = normalizeTopicForIdentity(subjectOverride ?? deps.activeTopic ?? "");
  await sendOutgoingMessageWithOptimisticUi({
    deps,
    body,
    target: {
      mode: "stream",
      stream: deps.activeStreamCanonicalName,
      streamId: deps.activeStreamId ?? undefined,
      subject,
    },
  });
}
