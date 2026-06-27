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
import { isWorkspaceMessengerMessageDto } from "./messenger.types";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "./messenger.types";

// Message endpoints only support markdown payloads in Workspace Messenger v1.
export interface GetMessagesQuery extends MessengerPaginationQuery {
  streamUuid?: string;
  topicUuid?: string;
}

// These actions are explicit gaps in the backend contract, not Zulip fallbacks.
export type UnsupportedMessengerApiAction =
  | "mark_message_unread"
  | "mark_conversation_read"
  | "add_reaction"
  | "remove_reaction"
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

function messagesQueryParams(query: GetMessagesQuery) {
  return {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
    topic_uuid: query.topicUuid,
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

export function markMessageUnreadUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("mark_message_unread");
}

export function markConversationReadUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("mark_conversation_read");
}

export function addReactionUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("add_reaction");
}

export function removeReactionUnsupported(..._args: unknown[]): Promise<never> {
  return rejectUnsupportedAction("remove_reaction");
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
