import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceTopicSummarySettingsDto,
  WorkspaceTopicSummarySettingsUpdateRequestBody,
} from "~/shared/api/messenger-topic-summary-management.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { WorkspaceMessengerTopicSummaryConfigurationRequestBody } from "~/shared/api/messenger.types";
import type {
  TopicSummaryGatesDraft,
  TopicSummaryOperationError,
  TopicSummaryTopicDraft,
  TopicSummaryValidationError,
} from "./topic-summary-settings.types";

export const TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH = 16_384;

const TOPIC_FIELD_NAMES = [
  "summary_enabled",
  "summary_system_prompt",
  "summary_reasoning_effort",
] as const satisfies readonly (keyof WorkspaceMessengerTopicSummaryConfigurationRequestBody)[];

export function topicSummaryDraftFromTopic(topic: MessengerTopic): TopicSummaryTopicDraft {
  return {
    summaryEnabled: topic.summaryEnabled ?? true,
    summarySystemPrompt: topic.summarySystemPrompt ?? null,
    summaryReasoningEffort: topic.summaryReasoningEffort ?? null,
  };
}

export function topicSummaryGatesDraftFromSettings(
  settings: WorkspaceTopicSummarySettingsDto,
): TopicSummaryGatesDraft {
  return {
    globalEnabled: settings.global_enabled,
    projectEnabled: settings.project_enabled,
  };
}

export function validateTopicSummaryDraft(
  draft: TopicSummaryTopicDraft,
): TopicSummaryValidationError | null {
  if (draft.summarySystemPrompt == null) return null;
  const prompt = draft.summarySystemPrompt.trim();
  if (prompt.length === 0) return "custom_prompt_empty";
  if (prompt.length > TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH) {
    return "custom_prompt_too_long";
  }
  return null;
}

export function normalizeTopicSummaryDraft(draft: TopicSummaryTopicDraft): TopicSummaryTopicDraft {
  return {
    ...draft,
    summarySystemPrompt:
      draft.summarySystemPrompt == null ? null : draft.summarySystemPrompt.trim(),
  };
}

export function diffTopicSummaryDraft(
  base: TopicSummaryTopicDraft,
  draft: TopicSummaryTopicDraft,
): WorkspaceMessengerTopicSummaryConfigurationRequestBody | null {
  const normalizedBase = normalizeTopicSummaryDraft(base);
  const normalizedDraft = normalizeTopicSummaryDraft(draft);
  const patch: Partial<WorkspaceMessengerTopicSummaryConfigurationRequestBody> = {};

  if (normalizedBase.summaryEnabled !== normalizedDraft.summaryEnabled) {
    patch.summary_enabled = normalizedDraft.summaryEnabled;
  }
  if (normalizedBase.summarySystemPrompt !== normalizedDraft.summarySystemPrompt) {
    patch.summary_system_prompt = normalizedDraft.summarySystemPrompt;
  }
  if (normalizedBase.summaryReasoningEffort !== normalizedDraft.summaryReasoningEffort) {
    patch.summary_reasoning_effort = normalizedDraft.summaryReasoningEffort;
  }

  return Object.keys(patch).length === 0
    ? null
    : (patch as WorkspaceMessengerTopicSummaryConfigurationRequestBody);
}

export function dirtyTopicSummaryFields(
  base: TopicSummaryTopicDraft | null,
  draft: TopicSummaryTopicDraft | null,
): readonly (keyof WorkspaceMessengerTopicSummaryConfigurationRequestBody)[] {
  if (base == null || draft == null) return [];
  const patch = diffTopicSummaryDraft(base, draft);
  if (patch == null) return [];
  return TOPIC_FIELD_NAMES.filter((field) => field in patch);
}

export function rebaseTopicSummaryDraft(
  base: TopicSummaryTopicDraft,
  local: TopicSummaryTopicDraft,
  incoming: TopicSummaryTopicDraft,
): TopicSummaryTopicDraft {
  return {
    summaryEnabled:
      local.summaryEnabled === base.summaryEnabled ? incoming.summaryEnabled : local.summaryEnabled,
    summarySystemPrompt:
      local.summarySystemPrompt === base.summarySystemPrompt
        ? incoming.summarySystemPrompt
        : local.summarySystemPrompt,
    summaryReasoningEffort:
      local.summaryReasoningEffort === base.summaryReasoningEffort
        ? incoming.summaryReasoningEffort
        : local.summaryReasoningEffort,
  };
}

export function areTopicSummaryGatesDraftsEqual(
  left: TopicSummaryGatesDraft,
  right: TopicSummaryGatesDraft,
): boolean {
  return left.globalEnabled === right.globalEnabled && left.projectEnabled === right.projectEnabled;
}

export function rebaseTopicSummaryGatesDraft(
  base: TopicSummaryGatesDraft,
  local: TopicSummaryGatesDraft,
  incoming: TopicSummaryGatesDraft,
): TopicSummaryGatesDraft {
  return {
    globalEnabled:
      local.globalEnabled === base.globalEnabled ? incoming.globalEnabled : local.globalEnabled,
    projectEnabled:
      local.projectEnabled === base.projectEnabled ? incoming.projectEnabled : local.projectEnabled,
  };
}

export function topicSummaryGatesUpdateBody(
  draft: TopicSummaryGatesDraft,
): WorkspaceTopicSummarySettingsUpdateRequestBody {
  return {
    global_enabled: draft.globalEnabled,
    project_enabled: draft.projectEnabled,
  };
}

export function areTopicSummaryGatesEffective(
  settings: TopicSummaryGatesDraft | WorkspaceTopicSummarySettingsDto,
): boolean {
  if ("globalEnabled" in settings) {
    return settings.globalEnabled && settings.projectEnabled;
  }
  return settings.global_enabled && settings.project_enabled;
}

function isContractTypeError(error: TypeError): boolean {
  return /^Expected (valid )?/.test(error.message);
}

export function mapTopicSummaryOperationError(error: unknown): TopicSummaryOperationError {
  if (error instanceof MessengerApiError) {
    if (error.status === 400) return "invalid";
    if (error.status === 401 || error.status === 403) return "forbidden";
    if (error.status >= 500) return "server";
    return "unknown";
  }
  if (error instanceof TypeError) {
    return isContractTypeError(error) ? "contract" : "network";
  }
  if (error instanceof SyntaxError) return "contract";
  return "unknown";
}
