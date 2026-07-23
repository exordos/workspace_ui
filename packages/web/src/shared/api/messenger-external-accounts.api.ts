import {
  isWorkspaceExternalAccountDto,
  isWorkspaceExternalChatDto,
  isWorkspaceExternalProviderHealthDto,
  isWorkspaceExternalProviderPolicyDto,
  type WorkspaceExternalAccountCreateRequestBody,
  type WorkspaceExternalAccountDto,
  type WorkspaceExternalAccountUpdateRequestBody,
  type WorkspaceExternalChatDto,
  type WorkspaceExternalProviderHealthDto,
  type WorkspaceExternalProviderPolicyDto,
  type WorkspaceExternalProviderPolicyUpdateRequestBody,
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

export async function updateExternalAccount(
  options: MessengerClientOptions,
  accountUuid: string,
  body: WorkspaceExternalAccountUpdateRequestBody,
  revision: number,
): Promise<WorkspaceExternalAccountDto> {
  const { data } = await messengerRequestJsonResult(
    "PUT",
    `/external_accounts/${accountUuid}`,
    options,
    {},
    body,
    { "If-Match": `"${revision}"` },
  );
  return parseDto(data, isWorkspaceExternalAccountDto, "external account response");
}

export async function getExternalChats(
  options: MessengerClientOptions,
  externalAccountUuid: string,
): Promise<WorkspaceExternalChatDto[]> {
  const data = await messengerGetJson("/external_chats/", options, {
    external_account_uuid: externalAccountUuid,
  });
  return parseStrictDtoList(data, isWorkspaceExternalChatDto, "external chats response");
}

async function changeExternalChatSelection(
  options: MessengerClientOptions,
  chatUuid: string,
  action: "select" | "deselect",
  projectId?: string,
): Promise<WorkspaceExternalChatDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/external_chats/${chatUuid}/actions/${action}/invoke`,
    options,
    {},
    action === "select" ? { project_id: projectId } : undefined,
  );
  return parseDto(data, isWorkspaceExternalChatDto, "external chat response");
}

export async function selectExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
  projectId: string,
): Promise<WorkspaceExternalChatDto> {
  return changeExternalChatSelection(options, chatUuid, "select", projectId);
}

export async function deselectExternalChat(
  options: MessengerClientOptions,
  chatUuid: string,
): Promise<WorkspaceExternalChatDto> {
  return changeExternalChatSelection(options, chatUuid, "deselect");
}

export interface WorkspaceExternalProviderPolicySnapshot {
  policy: WorkspaceExternalProviderPolicyDto;
  etag: string;
}

function policySnapshot(data: unknown, headers: Headers): WorkspaceExternalProviderPolicySnapshot {
  const policy = parseDto(
    data,
    isWorkspaceExternalProviderPolicyDto,
    "external provider policy response",
  );
  return { policy, etag: headers.get("ETag") ?? `"${policy.revision}"` };
}

export async function getExternalProviderPolicy(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderPolicySnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/external_provider_policies/zulip",
    options,
  );
  return policySnapshot(data, headers);
}

export async function updateExternalProviderPolicy(
  options: MessengerClientOptions,
  body: WorkspaceExternalProviderPolicyUpdateRequestBody,
  etag: string,
): Promise<WorkspaceExternalProviderPolicySnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "PUT",
    "/external_provider_policies/zulip",
    options,
    {},
    body,
    { "If-Match": etag },
  );
  return policySnapshot(data, headers);
}

export async function changeExternalProviderSuspension(
  options: MessengerClientOptions,
  action: "suspend" | "resume",
): Promise<WorkspaceExternalProviderPolicySnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "POST",
    `/external_provider_policies/zulip/actions/${action}/invoke`,
    options,
  );
  return policySnapshot(data, headers);
}

export async function getExternalProviderHealth(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderHealthDto> {
  const data = await messengerGetJson("/external_provider_health/zulip", options);
  return parseDto(data, isWorkspaceExternalProviderHealthDto, "external provider health response");
}
