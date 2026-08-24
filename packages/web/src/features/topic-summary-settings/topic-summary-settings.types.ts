import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceTopicSummarySettingsDto } from "~/shared/api/messenger-topic-summary-management.types";
import type { WorkspaceMessengerTopicSummaryConfigurationRequestBody } from "~/shared/api/messenger.types";

export type TopicSummaryReasoningEffort = NonNullable<MessengerTopic["summaryReasoningEffort"]>;

export type TopicSummaryPermission = "unknown" | "allowed" | "denied";
export type TopicSummaryLoadStatus = "idle" | "loading" | "ready" | "error";
export type TopicSummarySaveStatus = "idle" | "saving" | "saved" | "error";

export type TopicSummaryOperationError =
  | "invalid"
  | "forbidden"
  | "network"
  | "contract"
  | "server"
  | "unknown";

export type TopicSummaryValidationError = "custom_prompt_empty" | "custom_prompt_too_long";

export interface TopicSummaryTopicDraft {
  summaryEnabled: boolean;
  summarySystemPrompt: string | null;
  summaryReasoningEffort: TopicSummaryReasoningEffort | null;
}

export interface TopicSummaryGatesDraft {
  globalEnabled: boolean;
  projectEnabled: boolean;
}

export interface TopicSummaryTopicState {
  base: TopicSummaryTopicDraft | null;
  draft: TopicSummaryTopicDraft | null;
  dirtyFields: readonly (keyof WorkspaceMessengerTopicSummaryConfigurationRequestBody)[];
  status: TopicSummarySaveStatus;
  error: TopicSummaryOperationError | null;
  validationError: TopicSummaryValidationError | null;
  permission: TopicSummaryPermission;
}

export interface TopicSummaryGatesState {
  server: WorkspaceTopicSummarySettingsDto | null;
  draft: TopicSummaryGatesDraft | null;
  dirty: boolean;
  loadStatus: TopicSummaryLoadStatus;
  saveStatus: TopicSummarySaveStatus;
  error: TopicSummaryOperationError | null;
  permission: TopicSummaryPermission;
}

export interface TopicSummarySettingsState {
  topic: TopicSummaryTopicState;
  gates: TopicSummaryGatesState;
}
