/**
 * POST /api/messenger/v1/messages/ to the Workspace native messenger API.
 */
import { t } from "~/i18n/i18n";
import { guard } from "~/shared/lib/guards";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "./client";

export interface MessengerMessageSendClientParams {
  messageUuid: MessageId;
  streamUuid: string;
  topicUuid?: string;
  content: string;
}

export interface WorkspaceMessagePayload {
  kind: "markdown";
  content: string;
}

export interface WorkspaceMessageCreateBody {
  uuid: string;
  stream_uuid: string;
  topic_uuid?: string;
  payload: WorkspaceMessagePayload;
}

export interface WorkspaceMessageSendResult {
  messageUuid: MessageId;
  streamUuid: string;
  topicUuid?: string;
  content: string;
  isOwn?: boolean;
  createdAt?: string;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readResponseRow(data: unknown): Record<string, unknown> {
  if (data != null && typeof data === "object") {
    const row = data as Record<string, unknown>;
    if (row.message != null && typeof row.message === "object") {
      return row.message as Record<string, unknown>;
    }
    return row;
  }
  return {};
}

export function buildMessengerMessageSendBody(
  params: MessengerMessageSendClientParams,
): WorkspaceMessageCreateBody {
  return {
    uuid: params.messageUuid,
    stream_uuid: params.streamUuid,
    ...(params.topicUuid != null ? { topic_uuid: params.topicUuid } : {}),
    payload: {
      kind: "markdown",
      content: params.content,
    },
  };
}

export async function postWorkspaceSendMessage(
  params: MessengerMessageSendClientParams,
): Promise<WorkspaceMessageSendResult> {
  const body = buildMessengerMessageSendBody(params);
  const response = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/messages/",
    body,
  );
  const data =
    response.data != null && typeof response.data === "object"
      ? (response.data as {
          result?: string;
          msg?: string;
        })
      : {};
  if (!response.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.unknownError"));
  }

  const row = readResponseRow(response.data);
  const payload =
    row.payload != null && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {};
  const messageUuid =
    normalizeMessageId(row.uuid) ??
    normalizeMessageId(row.id) ??
    guard.messageId(params.messageUuid);
  const streamUuid = readString(row.stream_uuid) ?? params.streamUuid;
  const topicUuid = readString(row.topic_uuid) ?? params.topicUuid;
  const content = readString(payload.content) ?? params.content;
  const isOwn = typeof row.is_own === "boolean" ? row.is_own : undefined;
  const createdAt = readString(row.created_at) ?? undefined;

  return {
    messageUuid,
    streamUuid,
    ...(topicUuid != null ? { topicUuid } : {}),
    content,
    ...(isOwn != null ? { isOwn } : {}),
    ...(createdAt != null ? { createdAt } : {}),
  };
}
