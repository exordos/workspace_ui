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

function parseSettings(data: unknown): WorkspaceTopicSummarySettingsDto {
  return parseDto(data, isWorkspaceTopicSummarySettingsDto, "topic summary settings response");
}

function parseEndpoint(data: unknown): WorkspaceTopicSummaryEndpointDto {
  return parseDto(data, isWorkspaceTopicSummaryEndpointDto, "topic summary endpoint response");
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
    data,
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
