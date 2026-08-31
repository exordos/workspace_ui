import {
  isWorkspaceTopicSummaryEndpointDto,
  isWorkspaceTopicSummarySettingsDto,
} from "./messenger-topic-summary-management.types";
import {
  messengerDeleteJson,
  messengerGetJson,
  messengerPostJson,
  messengerPutJson,
  parseDto,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import type {
  WorkspaceTopicSummaryEndpointCreateRequestBody,
  WorkspaceTopicSummaryEndpointDto,
  WorkspaceTopicSummaryEndpointUpdateRequestBody,
  WorkspaceTopicSummarySettingsDto,
  WorkspaceTopicSummarySettingsUpdateRequestBody,
} from "./messenger-topic-summary-management.types";
import type { MessengerClientOptions } from "./messenger-transport.internal";
import type { WorkspaceMessengerUuid } from "./messenger.types";

const ENDPOINTS_PATH = "/topic_summary_endpoints/";
const NULLABLE_ENDPOINT_RESPONSE_FIELDS = [
  "claim_expires_at",
  "last_success_at",
  "last_failure_at",
  "last_error_code",
] as const satisfies readonly (keyof WorkspaceTopicSummaryEndpointDto)[];

function normalizeEndpointResponse(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return data;

  const normalized: Record<string, unknown> = { ...data };
  for (const field of NULLABLE_ENDPOINT_RESPONSE_FIELDS) {
    if (!(field in normalized)) normalized[field] = null;
  }
  return normalized;
}

function parseSettings(data: unknown): WorkspaceTopicSummarySettingsDto {
  return parseDto(data, isWorkspaceTopicSummarySettingsDto, "topic summary settings response");
}

function parseEndpoint(data: unknown): WorkspaceTopicSummaryEndpointDto {
  return parseDto(
    normalizeEndpointResponse(data),
    isWorkspaceTopicSummaryEndpointDto,
    "topic summary endpoint response",
  );
}

export async function getTopicSummarySettings(
  options: MessengerClientOptions,
  projectUuid: WorkspaceMessengerUuid,
): Promise<WorkspaceTopicSummarySettingsDto> {
  const data = await messengerGetJson(`/topic_summary_settings/${projectUuid}`, options);
  return parseSettings(data);
}

export async function updateTopicSummarySettings(
  options: MessengerClientOptions,
  projectUuid: WorkspaceMessengerUuid,
  body: WorkspaceTopicSummarySettingsUpdateRequestBody,
): Promise<WorkspaceTopicSummarySettingsDto> {
  const data = await messengerPutJson(`/topic_summary_settings/${projectUuid}`, options, body);
  return parseSettings(data);
}

export async function getTopicSummaryEndpoints(
  options: MessengerClientOptions,
): Promise<WorkspaceTopicSummaryEndpointDto[]> {
  const data = await messengerGetJson(ENDPOINTS_PATH, options);
  return parseStrictDtoList(
    Array.isArray(data) ? data.map(normalizeEndpointResponse) : data,
    isWorkspaceTopicSummaryEndpointDto,
    "topic summary endpoints response",
  );
}

export async function getTopicSummaryEndpoint(
  options: MessengerClientOptions,
  endpointUuid: WorkspaceMessengerUuid,
): Promise<WorkspaceTopicSummaryEndpointDto> {
  const data = await messengerGetJson(`${ENDPOINTS_PATH}${endpointUuid}`, options);
  return parseEndpoint(data);
}

export async function createTopicSummaryEndpoint(
  options: MessengerClientOptions,
  body: WorkspaceTopicSummaryEndpointCreateRequestBody,
): Promise<WorkspaceTopicSummaryEndpointDto> {
  const data = await messengerPostJson(ENDPOINTS_PATH, options, body);
  return parseEndpoint(data);
}

export async function updateTopicSummaryEndpoint(
  options: MessengerClientOptions,
  endpointUuid: WorkspaceMessengerUuid,
  body: WorkspaceTopicSummaryEndpointUpdateRequestBody,
): Promise<WorkspaceTopicSummaryEndpointDto> {
  const data = await messengerPutJson(`${ENDPOINTS_PATH}${endpointUuid}`, options, body);
  return parseEndpoint(data);
}

export async function deleteTopicSummaryEndpoint(
  options: MessengerClientOptions,
  endpointUuid: WorkspaceMessengerUuid,
): Promise<void> {
  await messengerDeleteJson(`${ENDPOINTS_PATH}${endpointUuid}`, options);
}
