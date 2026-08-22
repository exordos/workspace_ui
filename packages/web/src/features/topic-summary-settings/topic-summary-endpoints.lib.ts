import type {
  WorkspaceTopicSummaryEndpointCreateRequestBody,
  WorkspaceTopicSummaryEndpointDto,
  WorkspaceTopicSummaryEndpointUpdateRequestBody,
} from "~/shared/api/messenger-topic-summary-management.types";
import type {
  TopicSummaryEndpointDraft,
  TopicSummaryEndpointValidationErrors,
} from "./topic-summary-endpoints.types";

export const TOPIC_SUMMARY_ENDPOINT_DEFAULTS = {
  enabled: true,
  priority: 100,
  supportsVision: false,
  supportsReasoning: false,
  temperature: 0.2,
  maxOutputTokens: 512,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUIRED_ERROR = "required" as const;
const TOO_LONG_ERROR = "too_long" as const;

export function emptyTopicSummaryEndpointDraft(uuid: string): TopicSummaryEndpointDraft {
  return {
    uuid,
    name: "",
    baseUrl: "",
    model: "",
    apiKey: "",
    ...TOPIC_SUMMARY_ENDPOINT_DEFAULTS,
  };
}

export function topicSummaryEndpointDraftFromDto(
  endpoint: WorkspaceTopicSummaryEndpointDto,
): TopicSummaryEndpointDraft {
  return {
    uuid: endpoint.uuid,
    name: endpoint.name,
    baseUrl: endpoint.base_url,
    model: endpoint.model,
    apiKey: "",
    enabled: endpoint.enabled,
    priority: endpoint.priority,
    supportsVision: endpoint.supports_vision,
    supportsReasoning: endpoint.supports_reasoning,
    temperature: endpoint.temperature,
    maxOutputTokens: endpoint.max_output_tokens,
    topP: endpoint.top_p,
    presencePenalty: endpoint.presence_penalty,
    frequencyPenalty: endpoint.frequency_penalty,
  };
}

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeTopicSummaryEndpointDraft(
  draft: TopicSummaryEndpointDraft,
): TopicSummaryEndpointDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    baseUrl: normalizedBaseUrl(draft.baseUrl),
    model: draft.model.trim(),
  };
}

export function rebaseTopicSummaryEndpointDraft(
  base: TopicSummaryEndpointDraft,
  local: TopicSummaryEndpointDraft,
  incoming: TopicSummaryEndpointDraft,
): TopicSummaryEndpointDraft {
  return {
    uuid: incoming.uuid,
    name: local.name === base.name ? incoming.name : local.name,
    baseUrl: local.baseUrl === base.baseUrl ? incoming.baseUrl : local.baseUrl,
    model: local.model === base.model ? incoming.model : local.model,
    apiKey: local.apiKey,
    enabled: local.enabled === base.enabled ? incoming.enabled : local.enabled,
    priority: local.priority === base.priority ? incoming.priority : local.priority,
    supportsVision:
      local.supportsVision === base.supportsVision ? incoming.supportsVision : local.supportsVision,
    supportsReasoning:
      local.supportsReasoning === base.supportsReasoning
        ? incoming.supportsReasoning
        : local.supportsReasoning,
    temperature: local.temperature === base.temperature ? incoming.temperature : local.temperature,
    maxOutputTokens:
      local.maxOutputTokens === base.maxOutputTokens
        ? incoming.maxOutputTokens
        : local.maxOutputTokens,
    topP: local.topP === base.topP ? incoming.topP : local.topP,
    presencePenalty:
      local.presencePenalty === base.presencePenalty
        ? incoming.presencePenalty
        : local.presencePenalty,
    frequencyPenalty:
      local.frequencyPenalty === base.frequencyPenalty
        ? incoming.frequencyPenalty
        : local.frequencyPenalty,
  };
}

function validateRequiredString(value: string, maximum: number): "required" | "too_long" | null {
  const normalized = value.trim();
  if (normalized.length === 0) return "required";
  return normalized.length > maximum ? "too_long" : null;
}

function isValidBaseUrl(value: string): boolean {
  const normalized = normalizedBaseUrl(value);
  if (normalized.length === 0 || normalized.length > 2048) return false;
  try {
    const parsed = new URL(normalized);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.host.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function validateInteger(
  value: number,
  minimum: number,
  maximum: number,
): "integer_required" | "out_of_range" | null {
  if (!Number.isSafeInteger(value)) return "integer_required";
  return value < minimum || value > maximum ? "out_of_range" : null;
}

function validateNumber(value: number, minimum: number, maximum: number): "out_of_range" | null {
  return !Number.isFinite(value) || value < minimum || value > maximum ? "out_of_range" : null;
}

export function validateTopicSummaryEndpointDraft(
  draft: TopicSummaryEndpointDraft,
  mode: "create" | "update",
): TopicSummaryEndpointValidationErrors {
  const errors: TopicSummaryEndpointValidationErrors = {};
  if (!UUID_PATTERN.test(draft.uuid)) errors.uuid = "invalid";

  const nameError = validateRequiredString(draft.name, 255);
  if (nameError != null) errors.name = nameError;
  const modelError = validateRequiredString(draft.model, 255);
  if (modelError != null) errors.model = modelError;
  if (!isValidBaseUrl(draft.baseUrl)) errors.baseUrl = "invalid";

  if (mode === "create" && draft.apiKey.length === 0) {
    errors.apiKey = REQUIRED_ERROR;
  } else if (draft.apiKey.length > 8192) {
    errors.apiKey = TOO_LONG_ERROR;
  }

  const priorityError = validateInteger(draft.priority, 0, 1_000_000);
  if (priorityError != null) errors.priority = priorityError;
  const tokenError = validateInteger(draft.maxOutputTokens, 1, 32_768);
  if (tokenError != null) errors.maxOutputTokens = tokenError;

  const floatRanges = [
    ["temperature", draft.temperature, 0, 2],
    ["topP", draft.topP, 0, 1],
    ["presencePenalty", draft.presencePenalty, -2, 2],
    ["frequencyPenalty", draft.frequencyPenalty, -2, 2],
  ] as const;
  for (const [field, value, minimum, maximum] of floatRanges) {
    const error = validateNumber(value, minimum, maximum);
    if (error != null) errors[field] = error;
  }
  return errors;
}

export function topicSummaryEndpointCreateBody(
  draft: TopicSummaryEndpointDraft,
): WorkspaceTopicSummaryEndpointCreateRequestBody {
  const normalized = normalizeTopicSummaryEndpointDraft(draft);
  return {
    uuid: normalized.uuid,
    name: normalized.name,
    base_url: normalized.baseUrl,
    model: normalized.model,
    api_key: normalized.apiKey,
    enabled: normalized.enabled,
    priority: normalized.priority,
    supports_vision: normalized.supportsVision,
    supports_reasoning: normalized.supportsReasoning,
    temperature: normalized.temperature,
    max_output_tokens: normalized.maxOutputTokens,
    top_p: normalized.topP,
    presence_penalty: normalized.presencePenalty,
    frequency_penalty: normalized.frequencyPenalty,
  };
}

export function topicSummaryEndpointUpdateBody(
  base: TopicSummaryEndpointDraft,
  draft: TopicSummaryEndpointDraft,
): WorkspaceTopicSummaryEndpointUpdateRequestBody | null {
  const normalizedBase = normalizeTopicSummaryEndpointDraft(base);
  const normalizedDraft = normalizeTopicSummaryEndpointDraft(draft);
  const patch: Partial<WorkspaceTopicSummaryEndpointUpdateRequestBody> = {};

  if (normalizedDraft.name !== normalizedBase.name) patch.name = normalizedDraft.name;
  if (normalizedDraft.baseUrl !== normalizedBase.baseUrl) patch.base_url = normalizedDraft.baseUrl;
  if (normalizedDraft.model !== normalizedBase.model) patch.model = normalizedDraft.model;
  if (normalizedDraft.apiKey.length > 0) patch.api_key = normalizedDraft.apiKey;
  if (normalizedDraft.enabled !== normalizedBase.enabled) patch.enabled = normalizedDraft.enabled;
  if (normalizedDraft.priority !== normalizedBase.priority)
    patch.priority = normalizedDraft.priority;
  if (normalizedDraft.supportsVision !== normalizedBase.supportsVision) {
    patch.supports_vision = normalizedDraft.supportsVision;
  }
  if (normalizedDraft.supportsReasoning !== normalizedBase.supportsReasoning) {
    patch.supports_reasoning = normalizedDraft.supportsReasoning;
  }
  if (normalizedDraft.temperature !== normalizedBase.temperature) {
    patch.temperature = normalizedDraft.temperature;
  }
  if (normalizedDraft.maxOutputTokens !== normalizedBase.maxOutputTokens) {
    patch.max_output_tokens = normalizedDraft.maxOutputTokens;
  }
  if (normalizedDraft.topP !== normalizedBase.topP) patch.top_p = normalizedDraft.topP;
  if (normalizedDraft.presencePenalty !== normalizedBase.presencePenalty) {
    patch.presence_penalty = normalizedDraft.presencePenalty;
  }
  if (normalizedDraft.frequencyPenalty !== normalizedBase.frequencyPenalty) {
    patch.frequency_penalty = normalizedDraft.frequencyPenalty;
  }

  return Object.keys(patch).length === 0
    ? null
    : (patch as WorkspaceTopicSummaryEndpointUpdateRequestBody);
}
