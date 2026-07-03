import {
  MessengerApiError,
  messengerGetJson,
  messengerPostJson,
  messengerPublicGetJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parseDtoList,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import {
  isWorkspaceMessengerEpochDto,
  isWorkspaceMessengerEventDto,
  isWorkspaceMessengerFolderDto,
  isWorkspaceMessengerFolderItemDto,
  isWorkspaceMessengerMessageDto,
  isWorkspaceMessengerServerSettingsDto,
  isWorkspaceMessengerStreamDto,
  isWorkspaceMessengerTopicDto,
  isWorkspaceMessengerUserDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
  MessengerPublicClientOptions,
  MessengerQueryParams,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerEventDto,
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerServerSettingsDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
} from "./messenger.types";

export { MessengerApiError };
export type { MessengerClientOptions, MessengerCollectionPage, MessengerPaginationQuery };

// Это тонкая обёртка над Workspace Messenger API.
// Здесь ещё сырой backend-формат: snake_case, page_marker и UUID из ответа сервера.
export interface GetStreamTopicsQuery extends MessengerPaginationQuery {
  streamUuid?: string;
}

export interface GetMessagesQuery extends MessengerPaginationQuery {
  streamUuid?: string;
  topicUuid?: string;
}

export interface GetFolderItemsQuery extends MessengerPaginationQuery {
  folderUuid?: string;
}

export interface GetEventsQuery extends MessengerPaginationQuery {
  afterEpochVersion?: number;
}

export interface InvokeUserPresenceBody {
  status: "active" | "idle" | "offline" | "do_not_disturb";
  emoji?: string;
  text?: string;
}

const MESSAGES_BY_UUIDS_CHUNK_SIZE = 100;
const PAGINATION_QUERY_KEYS = new Set(["page_limit", "page_marker"]);

function normalizeMessageUuids(messageUuids: readonly string[]): string[] {
  // Backend bulk endpoint принимает uuid сообщений; здесь убираем пустые и дубли до запроса.
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const messageUuid of messageUuids) {
    const trimmed = messageUuid.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function chunkMessageUuids(messageUuids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < messageUuids.length; index += MESSAGES_BY_UUIDS_CHUNK_SIZE) {
    chunks.push(messageUuids.slice(index, index + MESSAGES_BY_UUIDS_CHUNK_SIZE));
  }
  return chunks;
}

function projectScopedParams(
  options: MessengerClientOptions,
  params: MessengerQueryParams,
): MessengerQueryParams {
  // Workspace gateway может обслуживать несколько проектов, поэтому project_id добавляем централизованно.
  const projectId = options.projectId?.trim();
  if (!projectId) {
    return params;
  }

  const scopedParams: MessengerQueryParams = {};
  if ("page_limit" in params) {
    scopedParams.page_limit = params.page_limit;
  }
  if ("page_marker" in params) {
    scopedParams.page_marker = params.page_marker;
  }
  scopedParams.project_id = projectId;

  for (const [key, value] of Object.entries(params)) {
    if (!PAGINATION_QUERY_KEYS.has(key) && key !== "project_id") {
      scopedParams[key] = value;
    }
  }

  return scopedParams;
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

// Эти вызовы кормят первый снимок нового messenger store.
// UI сюда напрямую не ходит: сначала DTO проходят через adapters.
export async function getStreams(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceMessengerStreamDto[]> {
  const data = await messengerGetJson("/streams/", options, paginationParams(query));
  return parseDtoList(data, isWorkspaceMessengerStreamDto, "messenger streams response");
}

export async function getStreamTopics(
  options: MessengerClientOptions,
  query: GetStreamTopicsQuery = {},
): Promise<WorkspaceMessengerTopicDto[]> {
  const data = await messengerGetJson("/stream_topics/", options, {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
  });
  return parseDtoList(data, isWorkspaceMessengerTopicDto, "messenger stream topics response");
}

export async function getMessages(
  options: MessengerClientOptions,
  query: GetMessagesQuery = {},
): Promise<WorkspaceMessengerMessageDto[]> {
  const data = await messengerGetJson(
    "/messages/",
    options,
    projectScopedParams(options, {
      ...paginationParams(query),
      stream_uuid: query.streamUuid,
      topic_uuid: query.topicUuid,
    }),
  );
  return parseDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response");
}

export async function getMessagesByUuids(
  options: MessengerClientOptions,
  messageUuids: readonly string[],
): Promise<WorkspaceMessengerMessageDto[]> {
  const normalizedUuids = normalizeMessageUuids(messageUuids);
  if (normalizedUuids.length === 0) {
    return [];
  }

  const pages = await Promise.all(
    chunkMessageUuids(normalizedUuids).map(async (chunk) => {
      const data = await messengerGetJson(
        "/messages/",
        options,
        projectScopedParams(options, { uuid: chunk }),
      );
      return parseDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response");
    }),
  );

  return pages.flat();
}

export async function getMessagesPage(
  options: MessengerClientOptions,
  query: GetMessagesQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/messages/",
    options,
    projectScopedParams(options, {
      ...paginationParams(query),
      stream_uuid: query.streamUuid,
      topic_uuid: query.topicUuid,
    }),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getFolders(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceMessengerFolderDto[]> {
  const data = await messengerGetJson("/folders/", options, paginationParams(query));
  return parseDtoList(data, isWorkspaceMessengerFolderDto, "messenger folders response");
}

export async function getFolderItems(
  options: MessengerClientOptions,
  query: GetFolderItemsQuery = {},
): Promise<WorkspaceMessengerFolderItemDto[]> {
  const data = await messengerGetJson("/folder_items/", options, {
    ...paginationParams(query),
    folder_uuid: query.folderUuid,
  });
  return parseDtoList(data, isWorkspaceMessengerFolderItemDto, "messenger folder items response");
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

export async function invokeUserPresence(
  options: MessengerClientOptions,
  userUuid: string,
  body: InvokeUserPresenceBody,
): Promise<void> {
  await messengerPostJson(
    `/users/${encodeURIComponent(userUuid)}/actions/presence/invoke`,
    options,
    body,
  );
}

export async function getEvents(
  options: MessengerClientOptions,
  query: GetEventsQuery = {},
): Promise<WorkspaceMessengerEventDto[]> {
  const data = await messengerGetJson(
    "/events/",
    options,
    projectScopedParams(options, {
      ...paginationParams(query),
      "epoch_version>": query.afterEpochVersion,
    }),
  );
  return parseStrictDtoList(data, isWorkspaceMessengerEventDto, "messenger events response");
}

export async function getEpoch(
  options: MessengerClientOptions,
): Promise<WorkspaceMessengerEpochDto> {
  const data = await messengerGetJson("/epoch/", options);
  return parseDto(data, isWorkspaceMessengerEpochDto, "messenger epoch response");
}
