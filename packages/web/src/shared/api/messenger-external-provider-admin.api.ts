import {
  isWorkspaceExternalProviderHealthDto,
  isWorkspaceExternalProviderPolicyDto,
  type WorkspaceExternalProviderHealthDto,
  type WorkspaceExternalProviderPolicyDto,
  type WorkspaceExternalProviderPolicyUpdateRequestBody,
} from "./messenger-external-provider-admin.types";
import { messengerRequestJsonResult, parseDto } from "./messenger-transport.internal";
import type { MessengerClientOptions } from "./messenger-transport.internal";

const ZULIP_POLICY_PATH = "/external_provider_policies/zulip";
const ZULIP_HEALTH_PATH = "/external_provider_health/zulip";

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
  const etag = headers.get("ETag");
  if (etag == null || etag.trim().length === 0) {
    throw new TypeError("Expected external provider policy response to include ETag");
  }
  return { policy, etag };
}

function parsePolicy(data: unknown): WorkspaceExternalProviderPolicyDto {
  return parseDto(data, isWorkspaceExternalProviderPolicyDto, "external provider policy response");
}

export async function getExternalProviderPolicy(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderPolicySnapshot> {
  const { data, headers } = await messengerRequestJsonResult("GET", ZULIP_POLICY_PATH, options);
  return policySnapshot(data, headers);
}

export async function updateExternalProviderPolicy(
  options: MessengerClientOptions,
  body: WorkspaceExternalProviderPolicyUpdateRequestBody,
  etag: string,
): Promise<WorkspaceExternalProviderPolicySnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "PUT",
    ZULIP_POLICY_PATH,
    options,
    {},
    body,
    { "If-Match": etag },
  );
  return policySnapshot(data, headers);
}

async function invokeExternalProviderPolicyAction(
  options: MessengerClientOptions,
  action: "suspend" | "resume",
): Promise<WorkspaceExternalProviderPolicyDto> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `${ZULIP_POLICY_PATH}/actions/${action}/invoke`,
    options,
  );
  return parsePolicy(data);
}

export function suspendExternalProvider(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderPolicyDto> {
  return invokeExternalProviderPolicyAction(options, "suspend");
}

export function resumeExternalProvider(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderPolicyDto> {
  return invokeExternalProviderPolicyAction(options, "resume");
}

export async function getExternalProviderHealth(
  options: MessengerClientOptions,
): Promise<WorkspaceExternalProviderHealthDto> {
  const { data } = await messengerRequestJsonResult("GET", ZULIP_HEALTH_PATH, options);
  return parseDto(data, isWorkspaceExternalProviderHealthDto, "external provider health response");
}
