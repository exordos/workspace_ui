import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceTopicSummaryEndpointCreateRequestBody,
  WorkspaceTopicSummaryEndpointDto,
  WorkspaceTopicSummaryEndpointUpdateRequestBody,
} from "~/shared/api/messenger-topic-summary-management.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import type {
  TopicSummaryLoadStatus,
  TopicSummaryOperationError,
  TopicSummaryPermission,
} from "./topic-summary-settings.types";

export type TopicSummaryEndpointOperationStatus = "idle" | "pending" | "success" | "error";

export type TopicSummaryEndpointValidationError =
  | "required"
  | "invalid"
  | "too_long"
  | "out_of_range"
  | "integer_required";

export interface TopicSummaryEndpointDraft {
  uuid: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  temperature: number;
  maxOutputTokens: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
}

export type TopicSummaryEndpointValidationErrors = Partial<
  Record<keyof TopicSummaryEndpointDraft, TopicSummaryEndpointValidationError>
>;

export interface TopicSummaryEndpointCreateState {
  draft: TopicSummaryEndpointDraft | null;
  validationErrors: TopicSummaryEndpointValidationErrors;
  status: TopicSummaryEndpointOperationStatus;
  error: TopicSummaryOperationError | null;
}

export interface TopicSummaryEndpointEditState {
  endpointUuid: string | null;
  base: TopicSummaryEndpointDraft | null;
  draft: TopicSummaryEndpointDraft | null;
  validationErrors: TopicSummaryEndpointValidationErrors;
  status: TopicSummaryEndpointOperationStatus;
  error: TopicSummaryOperationError | null;
}

export interface TopicSummaryEndpointDeleteState {
  endpointUuid: string | null;
  status: TopicSummaryEndpointOperationStatus;
  error: TopicSummaryOperationError | null;
}

export interface TopicSummaryEndpointsState {
  permission: TopicSummaryPermission;
  endpoints: readonly WorkspaceTopicSummaryEndpointDto[];
  loadStatus: TopicSummaryLoadStatus;
  loadError: TopicSummaryOperationError | null;
  create: TopicSummaryEndpointCreateState;
  edit: TopicSummaryEndpointEditState;
  remove: TopicSummaryEndpointDeleteState;
}

export interface TopicSummaryEndpointsClient {
  getEndpoints?: (options: MessengerClientOptions) => Promise<WorkspaceTopicSummaryEndpointDto[]>;
  createEndpoint?: (
    options: MessengerClientOptions,
    body: WorkspaceTopicSummaryEndpointCreateRequestBody,
  ) => Promise<WorkspaceTopicSummaryEndpointDto>;
  updateEndpoint?: (
    options: MessengerClientOptions,
    endpointUuid: string,
    body: WorkspaceTopicSummaryEndpointUpdateRequestBody,
  ) => Promise<WorkspaceTopicSummaryEndpointDto>;
  deleteEndpoint?: (options: MessengerClientOptions, endpointUuid: string) => Promise<void>;
}

export interface UseTopicSummaryEndpointsOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  permission: TopicSummaryPermission;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: TopicSummaryEndpointsClient;
  createEndpointUuid?: () => string;
}

export interface UseTopicSummaryEndpointsResult extends TopicSummaryEndpointsState {
  reload: () => void;
  startCreate: () => void;
  setCreateField: <Field extends keyof TopicSummaryEndpointDraft>(
    field: Field,
    value: TopicSummaryEndpointDraft[Field],
  ) => void;
  cancelCreate: () => void;
  createEndpoint: () => void;
  startEdit: (endpointUuid: string) => void;
  setEditField: <Field extends keyof TopicSummaryEndpointDraft>(
    field: Field,
    value: TopicSummaryEndpointDraft[Field],
  ) => void;
  cancelEdit: () => void;
  updateEndpoint: () => void;
  deleteEndpoint: (endpointUuid: string) => void;
}
