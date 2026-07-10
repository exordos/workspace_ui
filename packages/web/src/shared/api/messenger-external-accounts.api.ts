import {
  isWorkspaceExternalAccountDto,
  type WorkspaceExternalAccountCreateRequestBody,
  type WorkspaceExternalAccountDto,
} from "./messenger-external-accounts.types";
import {
  messengerGetJson,
  messengerPostJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import type {
  MessengerClientOptions,
  MessengerPaginationQuery,
} from "./messenger-transport.internal";

export async function getExternalAccounts(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceExternalAccountDto[]> {
  const data = await messengerGetJson("/external_accounts/", options, paginationParams(query));
  return parseStrictDtoList(data, isWorkspaceExternalAccountDto, "external accounts response");
}

export async function getExternalAccountsPage(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<{
  items: WorkspaceExternalAccountDto[];
  nextPageMarker: string | null;
  pageLimit: number | null;
}> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/external_accounts/",
    options,
    paginationParams(query),
  );
  return {
    items: parseStrictDtoList(data, isWorkspaceExternalAccountDto, "external accounts response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function createExternalAccount(
  options: MessengerClientOptions,
  body: WorkspaceExternalAccountCreateRequestBody,
): Promise<WorkspaceExternalAccountDto> {
  const data = await messengerPostJson("/external_accounts/", options, body);
  return parseDto(data, isWorkspaceExternalAccountDto, "external account response");
}
