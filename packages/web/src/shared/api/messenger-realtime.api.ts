import { getMessengerWebSocketBearerProtocol } from "./messenger-auth";
import {
  isWorkspaceMessengerEventDto,
  isWorkspaceMessengerWebSocketFrameDto,
} from "./messenger.types";
import type {
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceMessengerWebSocketFrameDto,
  WorkspaceRealtimeEvent,
} from "./messenger.types";

const DEFAULT_MESSENGER_WEBSOCKET_PATH = "/api/workspace/v1/events/ws";
const MESSENGER_WEBSOCKET_PROTOCOL = "workspace.events.v1";

export interface BuildMessengerWebSocketUrlOptions {
  baseUrl?: string;
  lastEpochVersion: number;
  epochGeneration?: string;
}

export function buildMessengerWebSocketUrl({
  baseUrl,
  lastEpochVersion,
  epochGeneration,
}: BuildMessengerWebSocketUrlOptions): string {
  // В URL оставляем только cursor. Токен и project scope не кладём в параметры,
  // чтобы не светить авторизацию в логах proxy и истории браузера.
  const root = (() => {
    const trimmed = baseUrl == null ? "" : baseUrl.replace(/\/+$/, "");
    if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/^https:/i, "wss:");
    if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:/i, "ws:");
    return trimmed;
  })();
  if (
    lastEpochVersion > 0 &&
    (typeof epochGeneration !== "string" || epochGeneration.trim().length === 0)
  ) {
    throw new TypeError("Workspace realtime resume cursor requires epoch_generation");
  }
  const search = new URLSearchParams();
  if (lastEpochVersion > 0) {
    search.set("last_epoch_version", String(lastEpochVersion));
    search.set("epoch_generation", epochGeneration ?? "");
  }
  return `${root}${DEFAULT_MESSENGER_WEBSOCKET_PATH}?${search.toString()}`;
}

export function buildMessengerWebSocketProtocols(accessToken: string): string[] {
  // Первый protocol выбирает версию realtime-событий, второй несёт Bearer-токен для сервера.
  const bearerProtocol = getMessengerWebSocketBearerProtocol(accessToken);
  return bearerProtocol == null
    ? [MESSENGER_WEBSOCKET_PROTOCOL]
    : [MESSENGER_WEBSOCKET_PROTOCOL, bearerProtocol];
}

// В runtime приходят строки из WebSocket, а в тестах удобнее передавать готовые объекты.
export function parseWorkspaceWebSocketFrame(raw: string): WorkspaceMessengerWebSocketFrameDto;
export function parseWorkspaceWebSocketFrame(raw: unknown): WorkspaceMessengerWebSocketFrameDto;
export function parseWorkspaceWebSocketFrame(raw: unknown): WorkspaceMessengerWebSocketFrameDto {
  let data: unknown;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new TypeError("Expected valid workspace websocket frame JSON", { cause: error });
    }
  } else {
    data = raw;
  }

  if (!isWorkspaceMessengerWebSocketFrameDto(data)) {
    throw new TypeError("Expected valid workspace websocket frame");
  }
  return data;
}

function withoutPayloadKind<TValue extends { kind: string }>(value: TValue): Omit<TValue, "kind"> {
  // REST outbox хранит kind внутри payload, а доменный event ожидает kind рядом с сущностью.
  const result: Partial<TValue> = { ...value };
  delete result.kind;
  return result as Omit<TValue, "kind">;
}

// REST-догонка и WebSocket должны попасть в один путь применения,
// иначе активный и фоновый режимы начнут жить по разным правилам.
// Поэтому REST outbox здесь приводится к форме WebSocket event.
export function normalizeWorkspaceRestEvent(
  model: WorkspaceMessengerRealtimeEventDto,
): WorkspaceRealtimeEvent | null {
  if (!isWorkspaceMessengerEventDto(model)) {
    return null;
  }

  switch (model.payload.kind) {
    case "message.created": {
      const message = withoutPayloadKind(model.payload);
      return {
        epoch_version: model.epoch_version,
        type: "message",
        message,
      };
    }
    case "message.updated":
    case "message.read": {
      const message = withoutPayloadKind(model.payload);
      return {
        epoch_version: model.epoch_version,
        type: "message",
        kind: "message.updated",
        message,
      };
    }
    case "message.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "message",
        kind: "message.deleted",
        message: {
          uuid: model.payload.uuid,
          stream_uuid: model.payload.stream_uuid,
          topic_uuid: model.payload.topic_uuid,
        },
      };
    case "stream.created":
    case "stream.updated":
    case "stream.read": {
      const { kind: payloadKind, ...stream } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "stream",
        kind: payloadKind === "stream.created" ? "stream.created" : "stream.updated",
        stream,
      };
    }
    case "stream.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "stream",
        kind: "stream.deleted",
        stream: {
          uuid: model.payload.uuid,
        },
      };
    case "stream_bindings.created":
      return {
        epoch_version: model.epoch_version,
        type: "stream_binding",
        kind: "stream_bindings.created",
        stream_uuid: model.payload.uuid,
        stream_bindings: model.payload.items,
      };
    case "stream_binding.updated": {
      const streamBinding = withoutPayloadKind(model.payload);
      return {
        epoch_version: model.epoch_version,
        type: "stream_binding",
        kind: "stream_binding.updated",
        stream_binding: streamBinding,
      };
    }
    case "stream_binding.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "stream_binding",
        kind: "stream_binding.deleted",
        stream_binding: {
          uuid: model.payload.uuid,
          stream_uuid: model.payload.stream_uuid,
          user_uuid: model.payload.user_uuid,
        },
      };
    case "topic.created":
    case "topic.updated":
    case "topic.read": {
      const { kind: payloadKind, ...topic } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "topic",
        kind: payloadKind === "topic.created" ? "topic.created" : "topic.updated",
        topic,
      };
    }
    case "topic.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "topic",
        kind: "topic.deleted",
        topic: {
          uuid: model.payload.uuid,
          stream_uuid: model.payload.stream_uuid,
        },
      };
    case "folder.created":
    case "folder.updated": {
      const { kind, ...folder } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "folder",
        kind,
        folder,
      };
    }
    case "folder.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "folder",
        kind: "folder.deleted",
        folder: {
          uuid: model.payload.uuid,
        },
      };
    case "folder_item.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "folder_item",
        kind: "folder_item.deleted",
        folder_item: {
          uuid: model.payload.uuid,
        },
      };
    case "file.created":
    case "file.updated": {
      const { kind, ...file } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "file",
        kind,
        file,
      };
    }
    case "file.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "file",
        kind: "file.deleted",
        file: {
          uuid: model.payload.uuid,
          stream_uuid: model.payload.stream_uuid,
        },
      };
    case "user.updated": {
      const { kind, ...user } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "user",
        kind,
        user,
      };
    }
    case "external_account.created":
    case "external_account.updated":
    case "external_account.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "external_account",
        kind: model.payload.kind,
        external_account: model.payload.snapshot,
      };
    case "external_chat.created":
    case "external_chat.updated":
    case "external_chat.deleted":
      return {
        epoch_version: model.epoch_version,
        type: "external_chat",
        kind: model.payload.kind,
        external_chat: model.payload.snapshot,
      };
    // Reaction row events are intentionally not applied to message.reactions here.
    // The backend emits message.updated snapshots with the aggregate reaction counters,
    // and the active applier uses that aggregate change to revalidate own reaction rows.
    // Returning null makes runtime/catch-up skip this event while still advancing cursor.
    case "message_reaction.created":
    case "message_reaction.updated":
    case "message_reaction.deleted":
      return null;
    // Historical migration event: current read updates use message.read/topic.read/stream.read.
    case "messages.read":
      return null;
    default:
      return null;
  }
}

export function normalizeWorkspaceWebSocketFrame(
  frame: WorkspaceMessengerWebSocketFrameDto,
): WorkspaceRealtimeEvent | null {
  if (isWorkspaceMessengerEventDto(frame)) {
    return normalizeWorkspaceRestEvent(frame);
  }
  return null;
}
