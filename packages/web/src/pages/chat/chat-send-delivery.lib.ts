import type { MockMessage } from "~/shared/api/zulip.types";

export type OutgoingMessageTarget =
  | {
      mode: "dm";
      recipientIds: number[];
    }
  | {
      mode: "stream";
      stream: string;
      streamId?: number;
      subject: string;
    };

export interface BuildOptimisticOutgoingMessageInput {
  id: number;
  senderId: number;
  senderFullName: string;
  content: string;
  target: OutgoingMessageTarget;
  nowSec?: number;
}

export function buildOptimisticOutgoingMessage(
  input: BuildOptimisticOutgoingMessageInput,
): MockMessage {
  const timestamp = input.nowSec ?? Math.floor(Date.now() / 1000);

  if (input.target.mode === "dm") {
    return {
      id: input.id,
      sender_id: input.senderId,
      sender_full_name: input.senderFullName,
      stream_id: null,
      display_recipient: input.target.recipientIds.map((id) => ({ id, full_name: "" })),
      subject: "",
      content: input.content,
      timestamp,
      delivery_status: "sending",
      local_echo_key: input.id,
    };
  }

  return {
    id: input.id,
    sender_id: input.senderId,
    sender_full_name: input.senderFullName,
    stream_id: input.target.streamId ?? null,
    display_recipient: input.target.stream,
    channel: input.target.stream,
    subject: input.target.subject,
    content: input.content,
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
