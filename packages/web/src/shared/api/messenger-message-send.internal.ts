/**
 * POST /api/messenger/v1/messages/ to the Workspace native messenger API.
 */
import { t } from "~/i18n/i18n";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { getMessengerWorkspaceApiBaseForCurrentInstance, messengerApi } from "./client";

export interface MessengerMessageSendClientParams {
  streamUuid: string;
  topicUuid?: string;
  content: string;
}

export interface WorkspaceMessagePayload {
  kind: "markdown";
  content: string;
}

export interface WorkspaceMessageCreateBody {
  stream_uuid: string;
  topic_uuid?: string;
  payload: WorkspaceMessagePayload;
}

export function buildMessengerMessageSendBody(
  params: MessengerMessageSendClientParams,
): WorkspaceMessageCreateBody {
  return {
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
): Promise<{ id?: MessageId }> {
  const body = buildMessengerMessageSendBody(params);
  const response = await messengerApi.postJsonWithBase(
    getMessengerWorkspaceApiBaseForCurrentInstance(),
    "/messages/",
    body,
  );
  const data = response.data as {
    result?: string;
    msg?: string;
    uuid?: unknown;
    id?: unknown;
  };
  if (!response.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.unknownError"));
  }
  return { id: normalizeMessageId(data.uuid) ?? normalizeMessageId(data.id) ?? undefined };
}
