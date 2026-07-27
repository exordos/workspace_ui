import {
  isWorkspaceExternalChatDto,
  type WorkspaceExternalChatDto,
} from "./messenger-external-chats.types";
import {
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

export async function getExternalChatsPage(
  options: MessengerClientOptions,
  externalAccountUuid: string,
  query: MessengerPaginationQuery = {},
): Promise<MessengerCollectionPage<WorkspaceExternalChatDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/external_chats/", options, {
    external_account_uuid: externalAccountUuid,
    ...paginationParams(query),
  });
  return {
    items: parseStrictDtoList(data, isWorkspaceExternalChatDto, "external chats response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getExternalChats(
  options: MessengerClientOptions,
  externalAccountUuid: string,
): Promise<WorkspaceExternalChatDto[]> {
  const items: WorkspaceExternalChatDto[] = [];
  let pageMarker: string | undefined;
  do {
    const page = await getExternalChatsPage(options, externalAccountUuid, {
      pageLimit: 100,
      pageMarker,
    });
    items.push(...page.items);
    pageMarker = page.nextPageMarker ?? undefined;
  } while (pageMarker != null);
  return items;
}

export async function getExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
): Promise<WorkspaceExternalChatDto> {
  const { data } = await messengerRequestJsonResult("GET", `/external_chats/${chatUuid}`, options);
  return parseDto(data, isWorkspaceExternalChatDto, "external chat response");
}

async function assignmentAction(
  options: MessengerClientOptions,
  chatUuid: string,
  action: "select" | "deselect" | "move",
  body?: { project_id: string },
  etag?: string,
): Promise<WorkspaceExternalChatDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/external_chats/${chatUuid}/actions/${action}/invoke`,
    options,
    {},
    body,
    etag == null ? undefined : { "If-Match": etag },
  );
  return parseDto(data, isWorkspaceExternalChatDto, "external chat response");
}

export function selectExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
  projectId: string,
): Promise<WorkspaceExternalChatDto> {
  return assignmentAction(options, chatUuid, "select", { project_id: projectId });
}

export function deselectExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
): Promise<WorkspaceExternalChatDto> {
  return assignmentAction(options, chatUuid, "deselect");
}

export function moveExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
  projectId: string,
  etag: string,
): Promise<WorkspaceExternalChatDto> {
  return assignmentAction(options, chatUuid, "move", { project_id: projectId }, etag);
}
