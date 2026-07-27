import { getStreamTopics } from "./messenger-topics.api";
import {
  messengerGetJson,
  messengerPostJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import {
  isWorkspaceMessengerStreamBindingDto,
  isWorkspaceMessengerStreamDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerCreateStreamRequestBody,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerStreamNotificationRequestBody,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUpdateStreamBindingRequestBody,
  WorkspaceMessengerUpdateStreamRequestBody,
} from "./messenger.types";

// Поток - основная backend-сущность чата в Workspace, включая личные private streams.
export interface GetStreamBindingsQuery extends MessengerPaginationQuery {
  streamUuid?: string;
}

export interface WorkspaceMessengerCreateStreamWithDefaultTopicResult {
  stream: WorkspaceMessengerStreamDto;
  defaultTopic: WorkspaceMessengerTopicDto;
}

function streamBindingParams(query: GetStreamBindingsQuery | undefined) {
  return {
    stream_uuid: query?.streamUuid,
  };
}

export async function getStreamsPage(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerStreamDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/streams/",
    options,
    paginationParams(query),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerStreamDto, "messenger streams response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getStream(
  options: MessengerClientOptions,
  streamUuid: string,
): Promise<WorkspaceMessengerStreamDto> {
  const data = await messengerGetJson(`/streams/${streamUuid}`, options);
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function createStream(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateStreamRequestBody,
): Promise<WorkspaceMessengerStreamDto> {
  const { data } = await messengerRequestJsonResult("POST", "/streams/", options, {}, body);
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function createStreamWithDefaultTopic(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateStreamRequestBody,
): Promise<WorkspaceMessengerCreateStreamWithDefaultTopicResult> {
  const stream = await createStream(options, body);
  // TODO: Remove this fetch when POST /streams/ returns default_topic.
  const topics = await getStreamTopics(options, { streamUuid: stream.uuid });
  const defaultTopic = topics.find(
    (topic) => topic.stream_uuid === stream.uuid && topic.is_default,
  );
  if (defaultTopic == null) {
    throw new TypeError(`Default topic was not returned for stream ${stream.uuid}`);
  }
  return { stream, defaultTopic };
}

export async function updateStream(
  options: MessengerClientOptions,
  streamUuid: string,
  body: WorkspaceMessengerUpdateStreamRequestBody,
): Promise<WorkspaceMessengerStreamDto> {
  const { data } = await messengerRequestJsonResult(
    "PUT",
    `/streams/${streamUuid}`,
    options,
    {},
    body,
  );
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function deleteStream(
  options: MessengerClientOptions,
  streamUuid: string,
): Promise<void> {
  await messengerRequestJsonResult("DELETE", `/streams/${streamUuid}`, options);
}

export async function addStreamUsers(
  options: MessengerClientOptions,
  streamUuid: string,
  body: WorkspaceMessengerAddStreamBindingsRequestBody,
): Promise<WorkspaceMessengerStreamBindingDto[]> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/streams/${streamUuid}/actions/add_users/invoke`,
    options,
    {},
    body,
  );
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerStreamBindingDto,
    "messenger stream bindings response",
  );
}

export async function archiveStream(
  options: MessengerClientOptions,
  streamUuid: string,
): Promise<WorkspaceMessengerStreamDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/streams/${streamUuid}/actions/archive/invoke`,
    options,
  );
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function unarchiveStream(
  options: MessengerClientOptions,
  streamUuid: string,
): Promise<WorkspaceMessengerStreamDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/streams/${streamUuid}/actions/unarchive/invoke`,
    options,
  );
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function updateStreamNotifications(
  options: MessengerClientOptions,
  streamUuid: string,
  body: WorkspaceMessengerStreamNotificationRequestBody,
): Promise<WorkspaceMessengerStreamDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/streams/${streamUuid}/actions/notifications/invoke`,
    options,
    {},
    body,
  );
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

export async function markStreamRead(
  options: MessengerClientOptions,
  streamUuid: string,
): Promise<WorkspaceMessengerStreamDto> {
  const data = await messengerPostJson(`/streams/${streamUuid}/actions/read/invoke`, options);
  return parseDto(data, isWorkspaceMessengerStreamDto, "messenger stream response");
}

// Stream bindings describe which users belong to a stream and with which role.
export async function getStreamBindings(
  options: MessengerClientOptions,
  query: GetStreamBindingsQuery = {},
): Promise<WorkspaceMessengerStreamBindingDto[]> {
  const data = await messengerGetJson("/stream_bindings/", options, {
    ...paginationParams(query),
    ...streamBindingParams(query),
  });
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerStreamBindingDto,
    "messenger stream bindings response",
  );
}

export async function getStreamBindingsPage(
  options: MessengerClientOptions,
  query: GetStreamBindingsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/stream_bindings/", options, {
    ...paginationParams(query),
    ...streamBindingParams(query),
  });
  return {
    items: parseStrictDtoList(
      data,
      isWorkspaceMessengerStreamBindingDto,
      "messenger stream bindings response",
    ),
    ...parsePaginationHeaders(headers),
  };
}

export async function getStreamBinding(
  options: MessengerClientOptions,
  bindingUuid: string,
): Promise<WorkspaceMessengerStreamBindingDto> {
  const data = await messengerGetJson(`/stream_bindings/${bindingUuid}`, options);
  return parseDto(data, isWorkspaceMessengerStreamBindingDto, "messenger stream binding response");
}

export async function updateStreamBinding(
  options: MessengerClientOptions,
  bindingUuid: string,
  body: WorkspaceMessengerUpdateStreamBindingRequestBody,
): Promise<WorkspaceMessengerStreamBindingDto> {
  const { data } = await messengerRequestJsonResult(
    "PUT",
    `/stream_bindings/${bindingUuid}`,
    options,
    {},
    body,
  );
  return parseDto(data, isWorkspaceMessengerStreamBindingDto, "messenger stream binding response");
}

export async function deleteStreamBinding(
  options: MessengerClientOptions,
  bindingUuid: string,
): Promise<void> {
  await messengerRequestJsonResult("DELETE", `/stream_bindings/${bindingUuid}`, options);
}
