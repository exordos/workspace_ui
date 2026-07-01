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
  isWorkspaceMessengerServerSettingsDto,
  isWorkspaceMessengerUserDto,
  isWorkspaceMessengerWebSocketFrameDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
  MessengerQueryParams,
  MessengerPublicClientOptions,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerEventDto,
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

function projectScopedRealtimeParams(
  options: MessengerClientOptions,
  params: MessengerQueryParams,
): MessengerQueryParams {
  // REST-догонка всё ещё принимает project_id как параметр запроса.
  // WebSocket берёт границы проекта из токена, поэтому buildMessengerWebSocketUrl его не добавляет.
  const projectId = options.projectId?.trim();
  if (!projectId) {
    return params;
  }

  return {
    ...params,
    project_id: projectId,
  };
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
): Promise<WorkspaceMessengerEventDto[]> {
  const data = await messengerGetJson(
    "/events/",
    options,
    projectScopedRealtimeParams(options, {
      ...paginationParams(query),
      "epoch_version>": query.afterEpochVersion,
    }),
  );
  return parseStrictDtoList(data, isWorkspaceMessengerEventDto, "messenger events response");
}

export async function getEventsPage(
  options: MessengerClientOptions,
  query: GetEventsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerEventDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/events/",
    options,
    projectScopedRealtimeParams(options, {
      ...paginationParams(query),
      "epoch_version>": query.afterEpochVersion,
    }),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerEventDto, "messenger events response"),
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
  model: WorkspaceMessengerEventDto,
): WorkspaceRealtimeEvent | null {
  switch (model.payload.kind) {
    case "message.created": {
      const message = withoutPayloadKind(model.payload);
      return {
        epoch_version: model.epoch_version,
        type: "message",
        message,
      };
    }
    case "message.updated": {
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
    case "stream.updated": {
      const { kind, ...stream } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "stream",
        kind,
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
        stream_uuid: model.payload.stream_uuid,
        stream_bindings: model.payload.stream_bindings,
      };
    case "topic.created":
    case "topic.updated": {
      const { kind, ...topic } = model.payload;
      return {
        epoch_version: model.epoch_version,
        type: "topic",
        kind,
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
    default:
      return null;
  }
}

export function normalizeWorkspaceWebSocketFrame(
  frame: WorkspaceMessengerWebSocketFrameDto,
): WorkspaceRealtimeEvent | null {
  // hello/connected/ping/error - служебные кадры транспорта, а не события мессенджера.
  if (frame.type !== "event") {
    return null;
  }
  return frame.event;
}
