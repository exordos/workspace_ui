/**
 * POST /messages with `read_by_sender` and optional Workspace local echo (`queue_id` + `local_id`).
 */
import { t } from "~/i18n/i18n";
import { getMessengerEventQueueIdForCurrentInstance } from "~/shared/lib/messenger-event-queue-registry.lib";
import { messengerPipelinePost } from "./messenger-pipeline.internal";

export type MessengerMessageSendClientParams =
  | {
      type: "private";
      to: number[];
      content: string;
    }
  | {
      type: "stream";
      to: string;
      topic?: string;
      content: string;
    };

export interface MessengerMessageSendOptions {
  /** Client local echo id; requires an active event `queue_id` on the server. */
  localId?: string;
}

export function buildMessengerMessageSendBody(
  params: MessengerMessageSendClientParams,
  options?: MessengerMessageSendOptions,
): Record<string, string> {
  const body: Record<string, string> = {
    type: params.type,
    content: params.content,
    read_by_sender: "true",
  };
  if (params.type === "private") {
    body.to = JSON.stringify(params.to);
  } else {
    body.to = params.to;
    if (params.topic != null) {
      body.topic = params.topic;
    }
  }
  const localId = options?.localId?.trim() ?? "";
  const queueId = getMessengerEventQueueIdForCurrentInstance();
  if (queueId != null && localId.length > 0) {
    body.queue_id = queueId;
    body.local_id = localId;
  }
  return body;
}

export async function postWorkspaceSendMessage(
  params: MessengerMessageSendClientParams,
  options?: MessengerMessageSendOptions,
): Promise<{ id?: number }> {
  const body = buildMessengerMessageSendBody(params, options);
  const response = await messengerPipelinePost("/messages", body);
  const data = response.data as {
    result?: string;
    msg?: string;
    id?: number;
  };
  if (!response.ok || data.result === "error") {
    throw new Error(data.msg ?? t("app.unknownError"));
  }
  return { id: data.id };
}
