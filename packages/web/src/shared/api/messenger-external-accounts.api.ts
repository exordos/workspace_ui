import {
  isWorkspaceExternalAccountDto,
  type WorkspaceExternalAccountCreateRequestBody,
  type WorkspaceExternalAccountDto,
  type WorkspaceExternalAccountReconnectRequestBody,
  type WorkspaceExternalAccountUpdateRequestBody,
} from "./messenger-external-accounts.types";
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

export interface WorkspaceExternalAccountSnapshot {
  account: WorkspaceExternalAccountDto;
  etag: string;
}

function accountEtag(account: WorkspaceExternalAccountDto, headers: Headers): string {
  return headers.get("ETag") ?? `"${account.revision}"`;
}

function parseAccountSnapshot(data: unknown, headers: Headers): WorkspaceExternalAccountSnapshot {
  const account = parseDto(data, isWorkspaceExternalAccountDto, "external account response");
  return { account, etag: accountEtag(account, headers) };
}

export async function getExternalAccounts(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<WorkspaceExternalAccountDto[]> {
  const { data } = await messengerRequestJsonResult(
    "GET",
    "/external_accounts/",
    options,
    paginationParams(query),
  );
  return parseStrictDtoList(data, isWorkspaceExternalAccountDto, "external accounts response");
}

export async function getExternalAccountsPage(
  options: MessengerClientOptions,
  query: MessengerPaginationQuery = {},
): Promise<MessengerCollectionPage<WorkspaceExternalAccountDto>> {
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

export async function getExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
): Promise<WorkspaceExternalAccountSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    `/external_accounts/${accountUuid}`,
    options,
  );
  return parseAccountSnapshot(data, headers);
}

export async function createExternalAccount(
  options: MessengerClientOptions,
  body: WorkspaceExternalAccountCreateRequestBody,
): Promise<WorkspaceExternalAccountSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "POST",
    "/external_accounts/",
    options,
    {},
    body,
  );
  return parseAccountSnapshot(data, headers);
}

export async function updateExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
  body: WorkspaceExternalAccountUpdateRequestBody,
  etag: string,
): Promise<WorkspaceExternalAccountSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "PUT",
    `/external_accounts/${accountUuid}`,
    options,
    {},
    body,
    { "If-Match": etag },
  );
  return parseAccountSnapshot(data, headers);
}

export async function reconnectExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
  body: WorkspaceExternalAccountReconnectRequestBody,
  etag: string,
): Promise<WorkspaceExternalAccountSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "POST",
    `/external_accounts/${accountUuid}/actions/reconnect/invoke`,
    options,
    {},
    body,
    { "If-Match": etag },
  );
  return parseAccountSnapshot(data, headers);
}

export async function disconnectExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
): Promise<WorkspaceExternalAccountSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "POST",
    `/external_accounts/${accountUuid}/actions/disconnect/invoke`,
    options,
  );
  return parseAccountSnapshot(data, headers);
}

export async function deleteExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
): Promise<void> {
  await messengerRequestJsonResult("DELETE", `/external_accounts/${accountUuid}`, options);
}
