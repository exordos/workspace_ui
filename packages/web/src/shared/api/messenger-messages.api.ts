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
import {
  isWorkspaceMessengerMessageDto,
  isWorkspaceMessengerMessageReactionDto,
} from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerCreateMessageReactionRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerMessageReactionDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "./messenger.types";

// Message endpoints only support markdown payloads in Workspace Messenger v1.
export interface GetMessagesQuery extends MessengerPaginationQuery {
  streamUuid?: string;
  topicUuid?: string;
  sortKey?: "created_at";
  sortDir?: "asc" | "desc";
}

export interface GetMessagePagesAroundResolvedMessageQuery {
  messageUuid: string;
  streamUuid: string;
  topicUuid?: string;
  beforeLimit?: number;
  afterLimit?: number;
}

export interface MessengerMessagePagesAroundResolvedMessage {
  before: WorkspaceMessengerMessageDto[];
  after: WorkspaceMessengerMessageDto[];
  beforePageMarker: string | null;
  afterPageMarker: string | null;
}

export interface GetMessageReactionsQuery {
  messageUuid?: string;
  userUuid?: string;
}

// These actions are explicit gaps in the backend contract, not Zulip fallbacks.
export type UnsupportedMessengerApiAction =
  | "mark_message_unread"
  | "mark_conversation_read"
  | "star_message"
  | "unstar_message"
  | "pin_message"
  | "unpin_message"
  | "upload_attachment"
  | "set_typing"
  | "search_messages"
  | "get_activity"
  | "get_link_preview";

export class UnsupportedMessengerApiActionError extends Error {
  readonly action: UnsupportedMessengerApiAction;

  constructor(action: UnsupportedMessengerApiAction) {
    super(`Workspace Messenger API action is unsupported: ${action}`);
    this.name = "UnsupportedMessengerApiActionError";
    this.action = action;
  }
}

const DEFAULT_MESSAGE_WINDOW_LIMIT = 50;

function messagesQueryParams(query: GetMessagesQuery) {
  return {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
    topic_uuid: query.topicUuid,
    sort_key: query.sortKey,
    sort_dir: query.sortDir,
  };
}

function messageReactionsQueryParams(query: GetMessageReactionsQuery) {
  return {
    message_uuid: query.messageUuid,
    user_uuid: query.userUuid,
  };
}

function rejectUnsupportedAction(action: UnsupportedMessengerApiAction): Promise<never> {
  return Promise.reject(new UnsupportedMessengerApiActionError(action));
}

// Message lists are strict because dropping rows would hide real chat history.
export async function getMessages(
  options: MessengerClientOptions,
  query: GetMessagesQuery = {},
): Promise<WorkspaceMessengerMessageDto[]> {
  const data = await messengerGetJson("/messages/", options, messagesQueryParams(query));
  return parseStrictDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response");
}

export async function getMessagesPage(
  options: MessengerClientOptions,
  query: GetMessagesQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/messages/",
    options,
    messagesQueryParams(query),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerMessageDto, "messenger messages response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getMessage(
  options: MessengerClientOptions,
  messageUuid: string,
): Promise<WorkspaceMessengerMessageDto> {
  const data = await messengerGetJson(`/messages/${messageUuid}`, options);
  return parseDto(data, isWorkspaceMessengerMessageDto, "messenger message response");
}

export async function getMessagePagesAroundResolvedMessage(
  options: MessengerClientOptions,
  query: GetMessagePagesAroundResolvedMessageQuery,
): Promise<MessengerMessagePagesAroundResolvedMessage> {
  const beforeLimit = query.beforeLimit ?? DEFAULT_MESSAGE_WINDOW_LIMIT;
  const afterLimit = query.afterLimit ?? DEFAULT_MESSAGE_WINDOW_LIMIT;
  const [beforeDescPage, afterAscPage] = await Promise.all([
    getMessagesPage(options, {
      streamUuid: query.streamUuid,
      topicUuid: query.topicUuid,
      pageLimit: beforeLimit,
      pageMarker: query.messageUuid,
      sortKey: "created_at",
      sortDir: "desc",
    }),
    getMessagesPage(options, {
      streamUuid: query.streamUuid,
      topicUuid: query.topicUuid,
      pageLimit: afterLimit,
      pageMarker: query.messageUuid,
      sortKey: "created_at",
      sortDir: "asc",
    }),
  ]);

  return {
    before: [...beforeDescPage.items].reverse(),
    after: afterAscPage.items,
    beforePageMarker: beforeDescPage.nextPageMarker,
    afterPageMarker: afterAscPage.nextPageMarker,
  };
}

export async function createMessage(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateMessageRequestBody,
): Promise<WorkspaceMessengerMessageDto> {
  const data = await messengerPostJson("/messages/", options, body);
  return parseDto(data, isWorkspaceMessengerMessageDto, "messenger message response");
}

export async function editMessage(
  options: MessengerClientOptions,
  messageUuid: string,
  body: WorkspaceMessengerUpdateMessageRequestBody,
): Promise<WorkspaceMessengerMessageDto> {
  const data = await messengerPutJson(`/messages/${messageUuid}`, options, body);
  return parseDto(data, isWorkspaceMessengerMessageDto, "messenger message response");
}

export async function deleteMessage(
  options: MessengerClientOptions,
  messageUuid: string,
): Promise<void> {
  await messengerDeleteJson(`/messages/${messageUuid}`, options);
}

export async function markMessageRead(
  options: MessengerClientOptions,
  messageUuid: string,
): Promise<WorkspaceMessengerMessageDto> {
  const data = await messengerPostJson(`/messages/${messageUuid}/actions/read/invoke`, options);
  return parseDto(data, isWorkspaceMessengerMessageDto, "messenger message response");
}

export async function markMessagesReadUpTo(
  options: MessengerClientOptions,
  messageUuid: string,
): Promise<WorkspaceMessengerMessageDto> {
  const data = await messengerPostJson(
    `/messages/${messageUuid}/actions/read_up_to/invoke`,
    options,
  );
  return parseDto(data, isWorkspaceMessengerMessageDto, "messenger message response");
}

// Эти wrappers являются единственным Workspace HTTP-контрактом реакций в shared/api.
// Они не знают про UI-состояние, IndexedDB или optimistic update: выше по слоям код
// сам решает, как связать агрегат message.reactions и uuid собственной реакции.
export async function getMessageReactions(
  options: MessengerClientOptions,
  query: GetMessageReactionsQuery,
): Promise<WorkspaceMessengerMessageReactionDto[]> {
  const data = await messengerGetJson(
    "/message_reactions/",
    options,
    messageReactionsQueryParams(query),
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

export function markMessageUnreadUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("mark_message_unread");
}

export function markConversationReadUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("mark_conversation_read");
}

export function starMessageUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("star_message");
}

export function unstarMessageUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("unstar_message");
}

export function pinMessageUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("pin_message");
}

export function unpinMessageUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("unpin_message");
}

export function uploadAttachmentUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("upload_attachment");
}

export function setTypingUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("set_typing");
}

export function searchMessagesUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("search_messages");
}

export function getActivityUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("get_activity");
}

export function getLinkPreviewUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("get_link_preview");
}
