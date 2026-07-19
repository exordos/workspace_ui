import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export type OutgoingMessageTarget =
  | {
      mode: "dm";
      recipientIds: UserId[];
    }
  | {
      mode: "stream";
      stream: string;
      streamUuid: string;
      subject: string;
      topicUuid?: string;
    };

export interface BuildOptimisticOutgoingMessageInput {
  id: MessageId;
  senderId: UserId | null;
  senderFullName: string;
  content: string;
  composerAttempt?: MockMessage["local_composer_attempt"];
  target: OutgoingMessageTarget;
  nowSec?: number;
}

export function buildOptimisticOutgoingMessage(
  input: BuildOptimisticOutgoingMessageInput,
): MockMessage {
  const timestamp = input.nowSec ?? Math.floor(Date.now() / 1000);
  const legacySenderId = typeof input.senderId === "number" ? input.senderId : 0;
  const senderUuid = typeof input.senderId === "string" ? input.senderId : undefined;
  const authorFields =
    senderUuid != null ? { author_uuid: senderUuid, sender_uuid: senderUuid } : {};

  if (input.target.mode === "dm") {
    return {
      id: input.id,
      sender_id: legacySenderId,
      ...authorFields,
      is_own: true,
      sender_full_name: input.senderFullName,
      stream_uuid: null,
      display_recipient: input.target.recipientIds.map((id) => ({ id, full_name: "" })),
      subject: "",
      content: input.content,
      markdown_source: input.content,
      ...(input.composerAttempt != null ? { local_composer_attempt: input.composerAttempt } : {}),
      timestamp,
      delivery_status: "sending",
      local_echo_key: input.id,
    };
  }

  return {
    id: input.id,
    sender_id: legacySenderId,
    ...authorFields,
    is_own: true,
    sender_full_name: input.senderFullName,
    stream_uuid: input.target.streamUuid,
    display_recipient: input.target.stream,
    channel: input.target.stream,
    subject: input.target.subject,
    ...(input.target.topicUuid != null ? { topic_uuid: input.target.topicUuid } : {}),
    content: input.content,
    markdown_source: input.content,
    ...(input.composerAttempt != null ? { local_composer_attempt: input.composerAttempt } : {}),
    timestamp,
    delivery_status: "sending",
    local_echo_key: input.id,
  };
}

export function markOutgoingMessageFailed(message: MockMessage): MockMessage {
  return {
    ...message,
    delivery_status: "failed",
  };
}

export function markOutgoingMessageSent(message: MockMessage): MockMessage {
  return {
    ...message,
    delivery_status: "sent",
  };
}
