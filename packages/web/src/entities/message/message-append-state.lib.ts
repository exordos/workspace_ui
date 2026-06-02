import type { MockMessage } from "~/shared/api/zulip.types";
import { mergeMessagePreservingLinkPreview } from "~/shared/lib/message-link-preview-merge.lib";
import { applyPendingLinkPreviewsToMessage } from "~/shared/lib/message-link-preview-pending.lib";
import { buildSendingEchoKeyIndex } from "./message-outgoing-echo-index.lib";
import { outgoingEchoContentMatches } from "./message-outgoing-echo.lib";
import type { CurrentChatMessagesState } from "./message.model.types";

export type MessageAppendIdbPlan =
  | { kind: "none" }
  | { kind: "put"; message: MockMessage }
  | { kind: "mergeReplace"; removeId: number; message: MockMessage };

type AppendMessageStateSlice = Pick<
  CurrentChatMessagesState,
  "messages" | "pendingOutgoingEchoKeys"
>;

function withOutgoingDeliveryStatus(message: MockMessage): MockMessage {
  if (message.id > 0) {
    return { ...message, delivery_status: "sent" };
  }
  return { ...message, delivery_status: "failed" };
}

function withPendingLinkPreviewsIfPersisted(message: MockMessage): MockMessage {
  return message.id > 0 ? applyPendingLinkPreviewsToMessage(message) : message;
}

function tryMergeOutgoingEcho(
  state: AppendMessageStateSlice,
  msg: MockMessage,
  idbRef: { current: MessageAppendIdbPlan },
): Partial<AppendMessageStateSlice> | null {
  const sendingEchoIndex = buildSendingEchoKeyIndex(state.messages);
  for (let qi = 0; qi < state.pendingOutgoingEchoKeys.length; qi++) {
    const echoKey = state.pendingOutgoingEchoKeys[qi]!;
    const msgIdx = sendingEchoIndex.get(echoKey) ?? -1;
    const pendingMessage = msgIdx >= 0 ? state.messages[msgIdx] : undefined;
    if (
      pendingMessage?.delivery_status !== "sending" ||
      pendingMessage.sender_id !== msg.sender_id ||
      !outgoingEchoContentMatches(pendingMessage, msg)
    ) {
      continue;
    }
    const prev = state.messages[msgIdx]!;
    const stableKey = prev.local_echo_key ?? prev.id;
    const merged = withPendingLinkPreviewsIfPersisted(
      mergeMessagePreservingLinkPreview(
        withOutgoingDeliveryStatus({ ...msg, local_echo_key: stableKey }),
        prev,
      ),
    );
    const queue = [...state.pendingOutgoingEchoKeys];
    queue.splice(qi, 1);
    const updated = [...state.messages];
    updated[msgIdx] = merged;
    idbRef.current = { kind: "mergeReplace", removeId: prev.id, message: merged };
    return { messages: updated, pendingOutgoingEchoKeys: queue };
  }
  return null;
}

function applyFailedOutgoingMessage(
  state: AppendMessageStateSlice,
  msg: MockMessage,
): Partial<AppendMessageStateSlice> {
  const echoKey = msg.local_echo_key ?? msg.id;
  const nextQueue = state.pendingOutgoingEchoKeys.filter((k) => k !== echoKey);
  const idx = state.messages.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const updated = [...state.messages];
    updated[idx] = msg;
    return { messages: updated, pendingOutgoingEchoKeys: nextQueue };
  }
  return {
    messages: [...state.messages, msg],
    pendingOutgoingEchoKeys: nextQueue,
  };
}

function applySendingOutgoingMessage(
  state: AppendMessageStateSlice,
  msg: MockMessage,
): Partial<AppendMessageStateSlice> {
  const echoKey = msg.local_echo_key ?? msg.id;
  const idx = state.messages.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const updated = [...state.messages];
    updated[idx] = msg;
    return { messages: updated };
  }
  return {
    messages: [...state.messages, msg],
    pendingOutgoingEchoKeys: [...state.pendingOutgoingEchoKeys, echoKey],
  };
}

export function computeAppendMessageStateUpdate(
  state: AppendMessageStateSlice,
  msg: MockMessage,
  idbRef: { current: MessageAppendIdbPlan },
): Partial<AppendMessageStateSlice> {
  if (msg.id > 0) {
    const mergedEcho = tryMergeOutgoingEcho(state, msg, idbRef);
    if (mergedEcho) {
      return mergedEcho;
    }
  }

  if (msg.id < 0 && msg.delivery_status === "failed") {
    return applyFailedOutgoingMessage(state, msg);
  }

  if (msg.id < 0 && msg.delivery_status === "sending") {
    return applySendingOutgoingMessage(state, msg);
  }

  const normalizedMsg = withPendingLinkPreviewsIfPersisted(msg);
  const idx = state.messages.findIndex((m) => m.id === normalizedMsg.id);
  if (idx >= 0) {
    const updated = [...state.messages];
    updated[idx] = normalizedMsg;
    idbRef.current =
      normalizedMsg.id < 0 ? { kind: "none" } : { kind: "put", message: normalizedMsg };
    return { messages: updated };
  }
  idbRef.current =
    normalizedMsg.id < 0 ? { kind: "none" } : { kind: "put", message: normalizedMsg };
  return { messages: [...state.messages, normalizedMsg] };
}
