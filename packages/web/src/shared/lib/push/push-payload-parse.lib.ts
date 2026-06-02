import { createLogger } from "../logger";
import type { PushMessagePayload } from "./types";

const log = createLogger("push:parse");

function parsePushMessageIds(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as number[];
  } catch {
    log.warn("Failed to parse message_ids in push middleware");
    return [];
  }
}

function parsePushFlags(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed.filter((flag): flag is string => typeof flag === "string");
  } catch {
    return undefined;
  }
}

export function buildPushPayloadFromEnvelopeData(
  data: Record<string, string>,
  notificationBody?: string,
): PushMessagePayload {
  const event = (data.event ?? data.type ?? "message") as PushMessagePayload["event"];

  if (event === "remove") {
    return {
      event: "remove",
      realm_uri: data.realm_uri,
      message_ids: parsePushMessageIds(data.message_ids),
    };
  }
  if (event === "test") {
    return { event: "test", realm_uri: data.realm_uri };
  }

  return {
    event: "message",
    realm_uri: data.realm_uri,
    message: {
      id: Number(data.message_id) || 0,
      sender_id: Number(data.sender_id) || 0,
      sender_full_name: data.sender_full_name ?? "",
      sender_avatar_url: data.sender_avatar_url,
      type: data.message_type === "private" ? "private" : "stream",
      stream_name: data.stream_name,
      stream_id: data.stream_id != null ? Number(data.stream_id) : undefined,
      topic: data.topic,
      content: data.content ?? notificationBody ?? "",
      flags: parsePushFlags(data.flags),
      timestamp: Number(data.time) || Math.floor(Date.now() / 1000),
    },
  };
}
