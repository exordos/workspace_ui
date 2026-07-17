import {
  DEFAULT_WORKSPACE_API_BASE,
  messengerGetJson,
  messengerPostJson,
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parseDtoList,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import {
  isWorkspaceMessengerEpochDto,
  isWorkspaceMessengerRealtimeEventDto,
  isWorkspaceMessengerUserDto,
} from "./messenger.types";
import type {
  MessengerCollectionPage,
  MessengerPaginationQuery,
  WorkspaceApiClientOptions,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceMessengerUserDto,
} from "./messenger.types";

export type WorkspaceClientOptions = WorkspaceApiClientOptions;
export type WorkspacePaginationQuery = MessengerPaginationQuery;
export type WorkspaceCollectionPage<T> = MessengerCollectionPage<T>;

export interface WorkspaceServiceDto {
  uuid: string;
  name: string;
  description: string;
  service_url: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetWorkspaceEventsQuery extends WorkspacePaginationQuery {
  afterEpochVersion?: number;
  epochGeneration?: string | number;
}

export interface InvokeWorkspaceUserPresenceBody {
  status: "active" | "idle" | "offline" | "do_not_disturb";
  emoji?: string | null;
  text?: string | null;
}

function withWorkspaceApiBase(options: WorkspaceClientOptions): WorkspaceApiClientOptions {
  return {
    ...options,
    baseUrl: options.baseUrl?.trim() || DEFAULT_WORKSPACE_API_BASE,
  };
}

function isWorkspaceServiceDto(value: unknown): value is WorkspaceServiceDto {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const service = value as Record<string, unknown>;
  return (
    typeof service.uuid === "string" &&
    typeof service.name === "string" &&
    typeof service.description === "string" &&
    typeof service.service_url === "string" &&
    (typeof service.icon === "string" || service.icon === null) &&
    typeof service.created_at === "string" &&
    typeof service.updated_at === "string"
  );
}

export async function getUsers(
  options: WorkspaceClientOptions,
  query: WorkspacePaginationQuery = {},
): Promise<WorkspaceMessengerUserDto[]> {
  const data = await messengerGetJson(
    "/users/",
    withWorkspaceApiBase(options),
    paginationParams(query),
  );
  return parseDtoList(data, isWorkspaceMessengerUserDto, "workspace users response");
}

export async function getUsersPage(
  options: WorkspaceClientOptions,
  query: WorkspacePaginationQuery = {},
): Promise<WorkspaceCollectionPage<WorkspaceMessengerUserDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/users/",
    withWorkspaceApiBase(options),
    paginationParams(query),
  );
  return {
    items: parseDtoList(data, isWorkspaceMessengerUserDto, "workspace users response"),
    ...parsePaginationHeaders(headers),
  };
}

export async function getUser(
  options: WorkspaceClientOptions,
  userUuid: string,
): Promise<WorkspaceMessengerUserDto> {
  const data = await messengerGetJson(
    `/users/${encodeURIComponent(userUuid)}`,
    withWorkspaceApiBase(options),
  );
  return parseDto(data, isWorkspaceMessengerUserDto, "workspace user response");
}

export async function getCurrentUser(
  options: WorkspaceClientOptions,
): Promise<WorkspaceMessengerUserDto> {
  const data = await messengerGetJson("/me/", withWorkspaceApiBase(options));
  return parseDto(data, isWorkspaceMessengerUserDto, "workspace me response");
}

export async function getServices(
  options: WorkspaceClientOptions,
  query: WorkspacePaginationQuery = {},
): Promise<WorkspaceServiceDto[]> {
  const data = await messengerGetJson(
    "/services/",
    withWorkspaceApiBase(options),
    paginationParams(query),
  );
  return parseDtoList(data, isWorkspaceServiceDto, "workspace services response");
}

export async function invokeUserPresence(
  options: WorkspaceClientOptions,
  userUuid: string,
  body: InvokeWorkspaceUserPresenceBody,
): Promise<WorkspaceMessengerUserDto> {
  const data = await messengerPostJson(
    `/users/${encodeURIComponent(userUuid)}/actions/presence/invoke`,
    withWorkspaceApiBase(options),
    body,
  );
  return parseDto(data, isWorkspaceMessengerUserDto, "workspace user presence response");
}

export async function getEvents(
  options: WorkspaceClientOptions,
  query: GetWorkspaceEventsQuery = {},
): Promise<WorkspaceMessengerRealtimeEventDto[]> {
  const data = await messengerGetJson("/events/", withWorkspaceApiBase(options), {
    ...paginationParams(query),
    "epoch_version>": query.afterEpochVersion,
    epoch_generation: query.epochGeneration,
  });
  return parseStrictDtoList(
    data,
    isWorkspaceMessengerRealtimeEventDto,
    "workspace events response",
  );
}

export async function getEventsPage(
  options: WorkspaceClientOptions,
  query: GetWorkspaceEventsQuery = {},
): Promise<WorkspaceCollectionPage<WorkspaceMessengerRealtimeEventDto>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/events/",
    withWorkspaceApiBase(options),
    {
      ...paginationParams(query),
      "epoch_version>": query.afterEpochVersion,
      epoch_generation: query.epochGeneration,
    },
  );
  return {
    items: parseStrictDtoList(
      data,
      isWorkspaceMessengerRealtimeEventDto,
      "workspace events response",
    ),
    ...parsePaginationHeaders(headers),
  };
}

export async function getEpoch(
  options: WorkspaceClientOptions,
): Promise<WorkspaceMessengerEpochDto> {
  const data = await messengerGetJson("/epoch/", withWorkspaceApiBase(options));
  return parseDto(data, isWorkspaceMessengerEpochDto, "workspace epoch response");
}
