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
import {
  isWorkspaceMessengerFolderDto,
  isWorkspaceMessengerFolderItemDto,
} from "./messenger.types";
import type {
  WorkspaceMessengerCreateFolderItemRequestBody,
  WorkspaceMessengerCreateFolderRequestBody,
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerUpdateFolderRequestBody,
} from "./messenger.types";

// Папки группируют потоки для текущего пользователя в новом Workspace-сайдбаре.
export interface GetFolderItemsQuery extends MessengerPaginationQuery {
  folderUuid?: string;
}

function resolveFolderItemFromFolderSnapshot(
  folder: WorkspaceMessengerFolderDto,
  match:
    | {
        folderItemUuid: string;
      }
    | {
        folderUuid: string;
        streamUuid: string;
        chatType: WorkspaceMessengerCreateFolderItemRequestBody["chat_type"];
      },
): WorkspaceMessengerFolderItemDto | null {
  if ("folderItemUuid" in match) {
    return folder.folder_items.find((item) => item.uuid === match.folderItemUuid) ?? null;
  }

  const candidates = folder.folder_items.filter((item) => {
    const itemFolderUuid = item.folder_uuid ?? item.folder;
    return (
      itemFolderUuid === match.folderUuid &&
      item.stream_uuid === match.streamUuid &&
      item.chat_type === match.chatType
    );
  });

  return candidates.at(-1) ?? null;
}

function parseFolderItemMutationResponse(
  data: unknown,
  match:
    | {
        folderItemUuid: string;
      }
    | {
        folderUuid: string;
        streamUuid: string;
        chatType: WorkspaceMessengerCreateFolderItemRequestBody["chat_type"];
      },
): WorkspaceMessengerFolderItemDto {
  if (isWorkspaceMessengerFolderItemDto(data)) {
    return data;
  }

  if (isWorkspaceMessengerFolderDto(data)) {
    const item = resolveFolderItemFromFolderSnapshot(data, match);
    if (item != null) {
      return item;
    }
  }

  throw new TypeError("Expected valid messenger folder item response");
}

export async function getFolders(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceMessengerFolderDto[]> {
  const data = await messengerGetJson("/folders/", options, paginationParams(query));
  return parseStrictDtoList(data, isWorkspaceMessengerFolderDto, "messenger folders response");
}

export async function getFoldersPage(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerFolderDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/folders/",
    options,
    paginationParams(query),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceMessengerFolderDto, "messenger folders response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getFolder(
  options: MessengerClientOptions,
  folderUuid: string,
): Promise<WorkspaceMessengerFolderDto> {
  const data = await messengerGetJson(`/folders/${folderUuid}`, options);
  return parseDto(data, isWorkspaceMessengerFolderDto, "messenger folder response");
}

export async function createFolder(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateFolderRequestBody,
): Promise<WorkspaceMessengerFolderDto> {
  const data = await messengerPostJson("/folders/", options, body);
  return parseDto(data, isWorkspaceMessengerFolderDto, "messenger folder response");
}

export async function updateFolder(
  options: MessengerClientOptions,
  folderUuid: string,
  body: WorkspaceMessengerUpdateFolderRequestBody,
): Promise<WorkspaceMessengerFolderDto> {
  const data = await messengerPutJson(`/folders/${folderUuid}`, options, body);
  return parseDto(data, isWorkspaceMessengerFolderDto, "messenger folder response");
}

export async function deleteFolder(
  options: MessengerClientOptions,
  folderUuid: string,
): Promise<void> {
  await messengerDeleteJson(`/folders/${folderUuid}`, options);
}

// Элемент папки связывает папку с конкретным потоком и хранит порядок/закрепление.
export async function getFolderItems(
  options: MessengerClientOptions,
  query: GetFolderItemsQuery = {},
): Promise<WorkspaceMessengerFolderItemDto[]> {
  const data = await messengerGetJson("/folder_items/", options, {
    ...paginationParams(query),
    folder_uuid: query.folderUuid,
  });
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerFolderItemDto,
    "messenger folder items response",
  );
}

export async function getFolderItemsPage(
  options: MessengerClientOptions,
  query: GetFolderItemsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerFolderItemDto>> {
  const { data, headers } = await messengerRequestJsonResult("GET", "/folder_items/", options, {
    ...paginationParams(query),
    folder_uuid: query.folderUuid,
  });
  return {
    items: parseStrictDtoList(
      data,
      isWorkspaceMessengerFolderItemDto,
      "messenger folder items response",
    ),
    ...parsePaginationHeaders(headers),
  };
}

export async function getFolderItem(
  options: MessengerClientOptions,
  folderItemUuid: string,
): Promise<WorkspaceMessengerFolderItemDto> {
  const data = await messengerGetJson(`/folder_items/${folderItemUuid}`, options);
  return parseDto(data, isWorkspaceMessengerFolderItemDto, "messenger folder item response");
}

export async function createFolderItem(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateFolderItemRequestBody,
): Promise<WorkspaceMessengerFolderItemDto> {
  const data = await messengerPostJson("/folder_items/", options, body);
  return parseFolderItemMutationResponse(data, {
    folderUuid: body.folder_uuid,
    streamUuid: body.stream_uuid,
    chatType: body.chat_type,
  });
}

export async function deleteFolderItem(
  options: MessengerClientOptions,
  folderItemUuid: string,
): Promise<void> {
  await messengerDeleteJson(`/folder_items/${folderItemUuid}`, options);
}

export async function pinFolderItem(
  options: MessengerClientOptions,
  folderItemUuid: string,
): Promise<WorkspaceMessengerFolderItemDto> {
  const data = await messengerPostJson(
    `/folder_items/${folderItemUuid}/actions/pin/invoke`,
    options,
  );
  return parseFolderItemMutationResponse(data, { folderItemUuid });
}

export async function unpinFolderItem(
  options: MessengerClientOptions,
  folderItemUuid: string,
): Promise<WorkspaceMessengerFolderItemDto> {
  const data = await messengerPostJson(
    `/folder_items/${folderItemUuid}/actions/unpin/invoke`,
    options,
  );
  return parseFolderItemMutationResponse(data, { folderItemUuid });
}
