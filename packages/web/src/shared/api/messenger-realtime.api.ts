import { getMessengerWebSocketBearerProtocol } from "./messenger-auth";
import {
  messengerGetJson,
  messengerPublicGetJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import {
  isWorkspaceMessengerEpochDto,
  isWorkspaceMessengerEventDto,
  isWorkspaceMessengerRealtimeEventDto,
  isWorkspaceMessengerServerSettingsDto,
  isWorkspaceMessengerUserDto,
  isWorkspaceMessengerWebSocketFrameDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
  MessengerPublicClientOptions,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceMessengerServerSettingsDto,
  WorkspaceMessengerUserDto,
  WorkspaceMessengerWebSocketFrameDto,
  WorkspaceRealtimeEvent,
} from "./messenger.types";

// REST живёт под /v1, а WebSocket сервер отдаёт через отдельный путь шлюза.
const DEFAULT_MESSENGER_WEBSOCKET_PATH = "/api/messenger/ws";
const MESSENGER_WEBSOCKET_PROTOCOL = "workspace.events.v1";

export type { MessengerClientOptions, MessengerCollectionPage, MessengerPaginationQuery };

export interface GetEventsQuery extends MessengerPaginationQuery {
  afterEpochVersion?: number;
}

export interface BuildMessengerWebSocketUrlOptions {
  baseUrl?: string;
  lastEpochVersion: number;
}

export async function getServerSettings(
  options: MessengerPublicClientOptions = {},
): Promise<WorkspaceMessengerServerSettingsDto> {
  const data = await messengerPublicGetJson("/server_settings", options);
  return parseDto(
    data,
    isWorkspaceMessengerServerSettingsDto,
    "messenger server_settings response",
  );
}

export async function getUsers(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceMessengerUserDto[]> {
  const data = await messengerGetJson("/users/", options, paginationParams(query));
  return parseStrictDtoList(data, isWorkspaceMessengerUserDto, "messenger users response");
}

export async function getUsersPage(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerUserDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/users/",
    options,
    paginationParams(query),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerUserDto, "messenger users response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getUser(
  options: MessengerClientOptions,
  userUuid: string,
): Promise<WorkspaceMessengerUserDto> {
  const data = await messengerGetJson(`/users/${encodeURIComponent(userUuid)}`, options);
  return parseDto(data, isWorkspaceMessengerUserDto, "messenger user response");
}

export async function getEvents(
  options: MessengerClientOptions,
  query: GetEventsQuery = {},
): Promise<WorkspaceMessengerRealtimeEventDto[]> {
  const data = await messengerGetJson("/events/", options, {
    ...paginationParams(query),
    "epoch_version>": query.afterEpochVersion,
  });
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerRealtimeEventDto,
    "messenger events response",
  );
}

export async function getEventsPage(
  options: MessengerClientOptions,
  query: GetEventsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerRealtimeEventDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/events/", options, {
    ...paginationParams(query),
    "epoch_version>": query.afterEpochVersion,
  });
  return {
    items: parseStrictDtoList(
      data,
      isWorkspaceMessengerRealtimeEventDto,
      "messenger events response",
    ),
    ...parsePaginationHeaders(headers),
  };
}

export async function getEpoch(
  options: MessengerClientOptions,
): Promise<WorkspaceMessengerEpochDto> {
  const data = await messengerGetJson("/epoch/", options);
  return parseDto(data, isWorkspaceMessengerEpochDto, "messenger epoch response");
}

export function buildMessengerWebSocketUrl({
  baseUrl,
  lastEpochVersion,
}: BuildMessengerWebSocketUrlOptions): string {
  // В URL оставляем только cursor. Токен и project scope не кладём в параметры,
  // чтобы не светить авторизацию в логах proxy и истории браузера.
  const root = (() => {
    const trimmed = baseUrl == null ? "" : baseUrl.replace(/\/+$/, "");
    if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/^https:/i, "wss:");
    if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:/i, "ws:");
    return trimmed;
  })();
  const search = new URLSearchParams({
    last_epoch_version: String(lastEpochVersion),
  });
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
    case "user.updated": {
      const { kind, ...user } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "user",
        kind,
        user,
      };
    }
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
  if (!("type" in frame) || frame.type !== "event") {
    return null;
  }
  return frame.event;
}
