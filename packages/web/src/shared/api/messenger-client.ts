import {
  MessengerApiError,
  messengerDeleteJson,
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
  isWorkspaceMessengerFolderDto,
  isWorkspaceMessengerFolderItemDto,
  isWorkspaceMessengerMessageDto,
  isWorkspaceMessengerMessageReactionDto,
  isWorkspaceMessengerServerSettingsDto,
  isWorkspaceMessengerStreamDto,
  isWorkspaceMessengerTopicDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
  MessengerPublicClientOptions,
  MessengerQueryParams,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerCreateMessageReactionRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerMessageReactionDto,
  WorkspaceMessengerServerSettingsDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
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
  starred?: boolean;
}

export interface GetMessageReactionsQuery {
  messageUuid?: string;
  userUuid?: string;
}

export interface GetFolderItemsQuery extends MessengerPaginationQuery {
  folderUuid?: string;
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
      starred: query.starred == null ? undefined : String(query.starred),
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
      starred: query.starred == null ? undefined : String(query.starred),
    }),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response"),
    ...parsePaginationHeaders(headers),
  };
}

// Reaction wrappers возвращают только Workspace DTO.
// В них нет UI-заглушек и старых Zulip payload-полей: backend сам определяет пользователя
// из bearer-сессии, а frontend передает только message_uuid и emoji_name.
export async function getMessageReactions(
  options: MessengerClientOptions,
  query: GetMessageReactionsQuery,
): Promise<WorkspaceMessengerMessageReactionDto[]> {
  const data = await messengerGetJson(
    "/message_reactions/",
    options,
    projectScopedParams(options, {
      message_uuid: query.messageUuid,
      user_uuid: query.userUuid,
    }),
  );
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerMessageReactionDto,
    "messenger message reactions response",
  );
}

export async function createMessageReaction(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateMessageReactionRequestBody,
): Promise<WorkspaceMessengerMessageReactionDto> {
  const data = await messengerPostJson("/message_reactions/", options, body);
  return parseDto(
    data,
    isWorkspaceMessengerMessageReactionDto,
    "messenger message reaction response",
  );
}

export async function deleteMessageReaction(
  options: MessengerClientOptions,
  reactionUuid: string,
): Promise<void> {
  await messengerDeleteJson(`/message_reactions/${reactionUuid}`, options);
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
