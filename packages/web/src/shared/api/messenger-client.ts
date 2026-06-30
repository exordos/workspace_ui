import {
  MessengerApiError,
  messengerGetJson,
  messengerPublicGetJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parseDtoList,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
  MessengerPublicClientOptions,
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
  const data = await messengerGetJson("/messages/", options, {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
    topic_uuid: query.topicUuid,
  });
  return parseDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response");
}

export async function getMessagesPage(
  options: MessengerClientOptions,
  query: GetMessagesQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/messages/", options, {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
    topic_uuid: query.topicUuid,
  });
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
  return parseDtoList(data, isWorkspaceMessengerUserDto, "messenger users response");
}

export async function getEvents(
  options: MessengerClientOptions,
  query: GetEventsQuery = {},
): Promise<WorkspaceMessengerEventDto[]> {
  const data = await messengerGetJson("/events/", options, {
    ...paginationParams(query),
    "epoch_version>": query.afterEpochVersion,
  });
  return parseStrictDtoList(data, isWorkspaceMessengerEventDto, "messenger events response");
}

export async function getEpoch(
  options: MessengerClientOptions,
): Promise<WorkspaceMessengerEpochDto> {
  const data = await messengerGetJson("/epoch/", options);
  return parseDto(data, isWorkspaceMessengerEpochDto, "messenger epoch response");
}
