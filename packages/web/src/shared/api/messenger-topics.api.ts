import {
  messengerDeleteJson,
  messengerGetJson,
  messengerPostJson,
  messengerPutJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
} from "./messenger-transport.internal";
import { isWorkspaceMessengerTopicDto } from "./messenger.types";
import type {
  WorkspaceMessengerCreateTopicRequestBody,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicNotificationRequestBody,
  WorkspaceMessengerUpdateTopicRequestBody,
  WorkspaceMessengerUuid,
} from "./messenger.types";

// Topics are user-visible conversations inside a stream.
export interface GetStreamTopicsQuery extends MessengerPaginationQuery {
  streamUuid?: WorkspaceMessengerUuid;
}

function streamTopicsParams(query: GetStreamTopicsQuery) {
  return {
    stream_uuid: query.streamUuid,
  };
}

function parseTopic(data: unknown): WorkspaceMessengerTopicDto {
  return parseDto(data, isWorkspaceMessengerTopicDto, "messenger stream topic response");
}

// List calls are strict so bad backend rows cannot disappear silently.
export async function getStreamTopics(
  options: MessengerClientOptions,
  query: GetStreamTopicsQuery = {},
): Promise<WorkspaceMessengerTopicDto[]> {
  const data = await messengerGetJson("/stream_topics/", options, {
    ...paginationParams(query),
    ...streamTopicsParams(query),
  });
  return parseStrictDtoList(data, isWorkspaceMessengerTopicDto, "messenger stream topics response");
}

export async function getStreamTopicsPage(
  options: MessengerClientOptions,
  query: GetStreamTopicsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerTopicDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/stream_topics/", options, {
    ...paginationParams(query),
    ...streamTopicsParams(query),
  });
  return {
    items: parseStrictDtoList(
      data,
      isWorkspaceMessengerTopicDto,
      "messenger stream topics response",
    ),
    ...parsePaginationHeaders(headers),
  };
}

export async function getStreamTopic(
  options: MessengerClientOptions,
  topicUuid: WorkspaceMessengerUuid,
): Promise<WorkspaceMessengerTopicDto> {
  const data = await messengerGetJson(`/stream_topics/${topicUuid}`, options);
  return parseTopic(data);
}

export async function createStreamTopic(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateTopicRequestBody,
): Promise<WorkspaceMessengerTopicDto> {
  const data = await messengerPostJson("/stream_topics/", options, body);
  return parseTopic(data);
}

export async function renameStreamTopic(
  options: MessengerClientOptions,
  topicUuid: WorkspaceMessengerUuid,
  body: WorkspaceMessengerUpdateTopicRequestBody,
): Promise<WorkspaceMessengerTopicDto> {
  const data = await messengerPutJson(`/stream_topics/${topicUuid}`, options, body);
  return parseTopic(data);
}

export async function deleteStreamTopic(
  options: MessengerClientOptions,
  topicUuid: WorkspaceMessengerUuid,
): Promise<void> {
  await messengerDeleteJson(`/stream_topics/${topicUuid}`, options);
}

export async function toggleStreamTopicDone(
  options: MessengerClientOptions,
  topicUuid: WorkspaceMessengerUuid,
): Promise<WorkspaceMessengerTopicDto> {
  const data = await messengerPostJson(
    `/stream_topics/${topicUuid}/actions/toggle_done/invoke`,
    options,
  );
  return parseTopic(data);
}

export async function setStreamTopicNotificationMode(
  options: MessengerClientOptions,
  topicUuid: WorkspaceMessengerUuid,
  body: WorkspaceMessengerTopicNotificationRequestBody,
): Promise<WorkspaceMessengerTopicDto> {
  const data = await messengerPostJson(
    `/stream_topics/${topicUuid}/actions/notifications/invoke`,
    options,
    body,
  );
  return parseTopic(data);
}
