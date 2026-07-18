/** IAM-authenticated provider-neutral external-messenger API. */

import {
  getMessengerWorkspaceApiBaseForCurrentInstance,
  messengerApi,
  type ApiResponse,
} from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { WorkspaceEventPayload } from "~/shared/types/workspace-event";
import type {
  CreateZulipExternalAccountInput,
  ExternalAccountMutationErrorKind,
  ExternalAccountMutationResult,
  ExternalAccountStatus,
  ExternalBridgeInstance,
  ExternalBridgeInstanceStatus,
  ExternalCapabilities,
  ExternalCapability,
  ExternalChat,
  ExternalHistoryDepth,
  ExternalOperation,
  ExternalOperationReconciliationReason,
  ExternalOperationReconciliationState,
  ExternalOperationPreflightInput,
  ExternalOperationPreflightResult,
  ExternalOperationStatus,
  ExternalProviderHealth,
  ExternalProviderLimits,
  ExternalProviderPolicy,
  ExternalSelectionMode,
  ReconnectZulipExternalAccountInput,
  UpdateExternalProviderPolicyInput,
  UpdateZulipExternalAccountInput,
  ZulipExternalAccount,
  ZulipExternalChatSource,
} from "./external-accounts.types";

const log = createLogger("external-accounts:api");
const EXTERNAL_ACCOUNTS_PATH = "/external_accounts/";
const EXTERNAL_CHATS_PATH = "/external_chats/";
const EXTERNAL_OPERATIONS_PATH = "/external_operations/";
const EXTERNAL_BRIDGE_INSTANCES_PATH = "/external_bridge_instances/";
const EXTERNAL_PROVIDER_POLICIES_PATH = "/external_provider_policies/";
const EXTERNAL_PROVIDER_HEALTH_PATH = "/external_provider_health/";

function apiBase(): string {
  return getMessengerWorkspaceApiBaseForCurrentInstance();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function readNextPageMarker(headers: Headers | undefined): string | null {
  const marker = headers?.get("X-Pagination-Marker")?.trim() ?? "";
  return marker.length > 0 ? marker : null;
}

async function fetchAllRows(
  path: string,
  params: Record<string, string> | undefined,
  signal: AbortSignal | undefined,
  firstResponse?: ApiResponse,
): Promise<{ rows: unknown[]; response: ApiResponse }> {
  const rows: unknown[] = [];
  const seenMarkers = new Set<string>();
  let response = firstResponse ?? (await messengerApi.getWithBase(apiBase(), path, params, signal));
  while (true) {
    if (!response.ok) return { rows, response };
    rows.push(...readRows(response.data));
    const marker = readNextPageMarker(response.headers);
    if (marker == null) return { rows, response };
    if (seenMarkers.has(marker)) throw new Error("External resource pagination marker repeated");
    seenMarkers.add(marker);
    const pageParams =
      params == null ? { page_marker: marker } : { ...params, page_marker: marker };
    response = await messengerApi.getWithBase(apiBase(), path, pageParams, signal);
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function readNumericMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) result[key] = entry;
  }
  return result;
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : readString(value);
}

function readSelectionMode(value: unknown): ExternalSelectionMode | null {
  return value === "explicit" || value === "all" ? value : null;
}

function readHistoryDepth(value: unknown): ExternalHistoryDepth | null {
  return value === "new" ||
    value === "7_days" ||
    value === "30_days" ||
    value === "90_days" ||
    value === "all"
    ? value
    : null;
}

function readAccountStatus(value: unknown): ExternalAccountStatus | null {
  return value === "connecting" ||
    value === "backfill" ||
    value === "live" ||
    value === "degraded" ||
    value === "auth_required" ||
    value === "disconnected" ||
    value === "suspended"
    ? value
    : null;
}

function readOperationStatus(value: unknown): ExternalOperationStatus | null {
  return value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "manual_reconciliation_required" ||
    value === "discarded"
    ? value
    : null;
}

function readReconciliationState(value: unknown): ExternalOperationReconciliationState | null {
  return value === "not_required" ||
    value === "delayed_check" ||
    value === "committed_match" ||
    value === "automatic_resend_queued" ||
    value === "manual_required"
    ? value
    : null;
}

function readReconciliationReason(value: unknown): ExternalOperationReconciliationReason | null {
  return value === "provider_history_unavailable" ||
    value === "no_match_after_auto_resend" ||
    value === "unsafe_provider_state"
    ? value
    : null;
}

function readCapability(value: unknown): ExternalCapability | null {
  if (!isRecord(value) || typeof value.available !== "boolean") return null;
  const revision = readInteger(value.revision);
  if (revision < 1) return null;
  const limits = isRecord(value.limits) ? value.limits : {};
  const unavailableReason = isRecord(value.unavailable_reason)
    ? {
        code: readString(value.unavailable_reason.code) ?? "unavailable",
        message: readString(value.unavailable_reason.message) ?? "",
      }
    : null;
  return {
    available: value.available,
    revision,
    limits,
    unavailableReason,
  };
}

function readCapabilities(value: unknown): ExternalCapabilities {
  if (!isRecord(value)) return {};
  const capabilities: ExternalCapabilities = {};
  for (const [name, descriptor] of Object.entries(value)) {
    const capability = readCapability(descriptor);
    if (capability != null) capabilities[name] = capability;
  }
  return capabilities;
}

function readEtag(headers: Headers | undefined): string | null {
  return headers?.get("ETag") ?? headers?.get("etag") ?? null;
}

function mapZulipExternalAccount(raw: unknown, etag: string | null): ZulipExternalAccount | null {
  if (!isRecord(raw) || !isRecord(raw.settings) || raw.settings.kind !== "zulip") return null;
  const uuid = readString(raw.uuid);
  const serverUrl = readString(raw.settings.server_url);
  const email = readString(raw.settings.email);
  const selectionMode = readSelectionMode(raw.settings.selection_mode);
  const historyDepth = readHistoryDepth(raw.settings.history_depth);
  const defaultProjectId = readString(raw.settings.default_project_id);
  const status = readAccountStatus(raw.status);
  if (
    uuid == null ||
    serverUrl == null ||
    email == null ||
    selectionMode == null ||
    historyDepth == null ||
    defaultProjectId == null ||
    status == null
  ) {
    return null;
  }
  return {
    uuid,
    settings: {
      kind: "zulip",
      serverUrl,
      email,
      selectionMode,
      historyDepth,
      defaultProjectId,
    },
    credentialPresent: raw.credential_present === true,
    status,
    liveReady: raw.live_ready === true,
    safeError: readNullableString(raw.safe_error),
    capabilities: readCapabilities(raw.capabilities),
    desiredGeneration: readInteger(raw.desired_generation),
    appliedGeneration: readInteger(raw.applied_generation),
    lastProgressAt: readNullableString(raw.last_progress_at),
    createdAt: readString(raw.created_at) ?? "",
    updatedAt: readString(raw.updated_at) ?? "",
    etag: etag ?? (readInteger(raw.revision) > 0 ? `"${readInteger(raw.revision)}"` : null),
  };
}

function externalAccountPath(uuid: string): string {
  return `${EXTERNAL_ACCOUNTS_PATH}${encodeURIComponent(guard.nonEmpty(uuid, "account uuid"))}`;
}

function externalChatPath(uuid: string): string {
  return `${EXTERNAL_CHATS_PATH}${encodeURIComponent(guard.nonEmpty(uuid, "chat uuid"))}`;
}

function externalOperationPath(uuid: string): string {
  return `${EXTERNAL_OPERATIONS_PATH}${encodeURIComponent(guard.nonEmpty(uuid, "operation uuid"))}`;
}

function mapMutationError(status: number): ExternalAccountMutationErrorKind {
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 412 || status === 428) return "precondition";
  if (status === 400 || status === 422) return "invalid";
  return "transient";
}

function mutationFailure<T>(response: ApiResponse): ExternalAccountMutationResult<T> {
  return { ok: false, kind: mapMutationError(response.status) };
}

function buildCreateSettings(input: CreateZulipExternalAccountInput) {
  return {
    kind: "zulip" as const,
    server_url: guard.nonEmpty(input.serverUrl, "Zulip server URL").trim(),
    email: guard.nonEmpty(input.email, "Zulip email").trim(),
    api_key: guard.nonEmpty(input.apiKey, "Zulip API key").trim(),
    selection_mode: input.selectionMode,
    history_depth: input.historyDepth,
    default_project_id: guard.nonEmpty(input.defaultProjectId, "default project uuid").trim(),
  };
}

async function fetchAccountResource(
  uuid: string,
  signal?: AbortSignal,
): Promise<ZulipExternalAccount | null> {
  const response = await messengerApi.getWithBase(
    apiBase(),
    externalAccountPath(uuid),
    undefined,
    signal,
  );
  if (!response.ok) return null;
  return mapZulipExternalAccount(response.data, readEtag(response.headers));
}

export async function fetchZulipExternalAccount(options?: {
  signal?: AbortSignal;
}): Promise<ZulipExternalAccount | null> {
  const { rows, response } = await fetchAllRows(EXTERNAL_ACCOUNTS_PATH, undefined, options?.signal);
  if (!response.ok) {
    throw new Error(`External accounts request failed (${response.status})`);
  }
  const account = rows
    .map((row) => mapZulipExternalAccount(row, null))
    .find((row): row is ZulipExternalAccount => row != null);
  if (account == null) return null;
  return (await fetchAccountResource(account.uuid, options?.signal)) ?? account;
}

export async function createZulipExternalAccount(
  input: CreateZulipExternalAccountInput,
): Promise<ExternalAccountMutationResult<ZulipExternalAccount>> {
  const response = await messengerApi.postJsonWithBase(apiBase(), EXTERNAL_ACCOUNTS_PATH, {
    uuid: guard.nonEmpty(input.uuid, "external account uuid").trim(),
    settings: buildCreateSettings(input),
  });
  if (!response.ok) return mutationFailure(response);
  const account = mapZulipExternalAccount(response.data, readEtag(response.headers));
  if (account == null) return { ok: false, kind: "transient" };
  return { ok: true, value: account };
}

export async function updateZulipExternalAccount(
  input: UpdateZulipExternalAccountInput,
): Promise<ExternalAccountMutationResult<ZulipExternalAccount>> {
  const response = await messengerApi.putJsonWithBase(
    apiBase(),
    externalAccountPath(input.uuid),
    {
      settings: {
        kind: "zulip",
        selection_mode: input.selectionMode,
        history_depth: input.historyDepth,
        default_project_id: guard.nonEmpty(input.defaultProjectId, "default project uuid").trim(),
      },
    },
    { "If-Match": guard.nonEmpty(input.etag, "external account ETag") },
  );
  if (!response.ok) return mutationFailure(response);
  const account = mapZulipExternalAccount(response.data, readEtag(response.headers));
  if (account == null) return { ok: false, kind: "transient" };
  return { ok: true, value: account };
}

export async function reconnectZulipExternalAccount(
  input: ReconnectZulipExternalAccountInput,
): Promise<ExternalAccountMutationResult<ZulipExternalAccount>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${externalAccountPath(input.uuid)}/actions/reconnect/invoke`,
    {
      settings: {
        kind: "zulip",
        server_url: guard.nonEmpty(input.serverUrl, "Zulip server URL").trim(),
        email: guard.nonEmpty(input.email, "Zulip email").trim(),
        api_key: guard.nonEmpty(input.apiKey, "Zulip API key").trim(),
      },
    },
    { "If-Match": guard.nonEmpty(input.etag, "external account ETag") },
  );
  if (!response.ok) return mutationFailure(response);
  const account = mapZulipExternalAccount(response.data, readEtag(response.headers));
  if (account == null) return { ok: false, kind: "transient" };
  return { ok: true, value: account };
}

export async function disconnectZulipExternalAccount(
  uuid: string,
): Promise<ExternalAccountMutationResult<ZulipExternalAccount>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${externalAccountPath(uuid)}/actions/disconnect/invoke`,
    {},
  );
  if (!response.ok) return mutationFailure(response);
  const account = mapZulipExternalAccount(response.data, readEtag(response.headers));
  if (account == null) return { ok: false, kind: "transient" };
  return { ok: true, value: account };
}

export async function deleteZulipExternalAccount(
  uuid: string,
): Promise<ExternalAccountMutationResult<null>> {
  const response = await messengerApi.deleteWithBase(apiBase(), externalAccountPath(uuid));
  if (!response.ok) return mutationFailure(response);
  return { ok: true, value: null };
}

function mapExternalChat(raw: unknown, etag: string | null = null): ExternalChat | null {
  if (!isRecord(raw) || !isRecord(raw.source) || raw.source.kind !== "zulip") return null;
  const uuid = readString(raw.uuid);
  const externalAccountUuid = readString(raw.external_account_uuid);
  if (uuid == null || externalAccountUuid == null) return null;
  const chatType = raw.source.chat_type;
  const displayName = readString(raw.display_name);
  const historyDepth = readHistoryDepth(raw.history_depth);
  if (
    (chatType !== "channel" && chatType !== "direct" && chatType !== "group_direct") ||
    displayName == null ||
    historyDepth == null
  ) {
    return null;
  }
  const source: ZulipExternalChatSource = {
    ...raw.source,
    kind: "zulip",
    chatType,
    originalUrl: readNullableString(raw.source.original_url),
  };
  return {
    uuid,
    externalAccountUuid,
    source,
    displayName,
    selected: raw.selected === true,
    projectId: readNullableString(raw.project_id),
    historyDepth,
    projectionStreamUuid: readNullableString(raw.projection_stream_uuid),
    status: readString(raw.status) ?? "available",
    safeError: readNullableString(raw.safe_error),
    capabilities: readCapabilities(raw.capabilities),
    revision: readInteger(raw.revision),
    etag: etag ?? (readInteger(raw.revision) > 0 ? `"${readInteger(raw.revision)}"` : null),
    createdAt: readNullableString(raw.created_at),
    updatedAt: readNullableString(raw.updated_at),
  };
}

export async function fetchExternalChats(
  externalAccountUuid: string,
  signal?: AbortSignal,
): Promise<ExternalChat[]> {
  const { rows, response } = await fetchAllRows(
    EXTERNAL_CHATS_PATH,
    { external_account_uuid: guard.nonEmpty(externalAccountUuid, "external account uuid") },
    signal,
  );
  if (!response.ok) throw new Error(`External chats request failed (${response.status})`);
  return rows
    .map((row) => mapExternalChat(row))
    .filter((chat): chat is ExternalChat => chat != null);
}

export async function fetchExternalChat(
  chatUuid: string,
  signal?: AbortSignal,
): Promise<ExternalChat | null> {
  const response = await messengerApi.getWithBase(
    apiBase(),
    externalChatPath(chatUuid),
    undefined,
    signal,
  );
  if (!response.ok) return null;
  return mapExternalChat(response.data, readEtag(response.headers));
}

async function mutateExternalChat(
  chatUuid: string,
  action: "select" | "deselect" | "move",
  body: Record<string, string>,
  headers?: Record<string, string>,
): Promise<ExternalAccountMutationResult<ExternalChat>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${externalChatPath(chatUuid)}/actions/${action}/invoke`,
    body,
    headers,
  );
  if (!response.ok) return mutationFailure(response);
  const chat = mapExternalChat(response.data, readEtag(response.headers));
  if (chat == null) return { ok: false, kind: "transient" };
  return { ok: true, value: chat };
}

export function selectExternalChat(
  chatUuid: string,
  projectId: string,
): Promise<ExternalAccountMutationResult<ExternalChat>> {
  return mutateExternalChat(chatUuid, "select", {
    project_id: guard.nonEmpty(projectId, "project uuid").trim(),
  });
}

export function deselectExternalChat(
  chatUuid: string,
): Promise<ExternalAccountMutationResult<ExternalChat>> {
  return mutateExternalChat(chatUuid, "deselect", {});
}

export async function moveExternalChat(
  chatUuid: string,
  projectId: string,
  etag?: string | null,
): Promise<ExternalAccountMutationResult<ExternalChat>> {
  const currentChat = etag == null ? await fetchExternalChat(chatUuid) : null;
  const effectiveEtag = etag ?? currentChat?.etag;
  if (effectiveEtag == null) return { ok: false, kind: "precondition" };
  return mutateExternalChat(
    chatUuid,
    "move",
    { project_id: guard.nonEmpty(projectId, "project uuid").trim() },
    { "If-Match": guard.nonEmpty(effectiveEtag, "external chat ETag") },
  );
}

function mapExternalOperation(raw: unknown): ExternalOperation | null {
  if (!isRecord(raw)) return null;
  const uuid = readString(raw.uuid);
  const externalAccountUuid = readString(raw.external_account_uuid);
  const action = readString(raw.action);
  const targetType = readString(raw.target_type);
  const status = readOperationStatus(raw.status);
  const reconciliationState = readReconciliationState(raw.reconciliation_state);
  if (
    uuid == null ||
    externalAccountUuid == null ||
    action == null ||
    targetType == null ||
    status == null ||
    reconciliationState == null
  ) {
    return null;
  }
  return {
    uuid,
    externalAccountUuid,
    action,
    targetType,
    targetUuid: readNullableString(raw.target_uuid),
    status,
    safeError: readNullableString(raw.safe_error),
    canRetry: raw.can_retry === true,
    canDiscard: raw.can_discard === true,
    duplicateRisk: raw.duplicate_risk === true,
    retryRequiresConfirmation: raw.retry_requires_confirmation === true,
    originalUrl: readNullableString(raw.original_url),
    reconciliationState,
    reconciliationReason: readReconciliationReason(raw.reconciliation_reason),
    reconciliationEvidence: isRecord(raw.reconciliation_evidence)
      ? raw.reconciliation_evidence
      : {},
    attempt: readInteger(raw.attempt),
    attemptHistory: Array.isArray(raw.attempt_history) ? raw.attempt_history : [],
    details: isRecord(raw.details) ? raw.details : {},
    revision: readInteger(raw.revision),
    createdAt: readNullableString(raw.created_at),
    updatedAt: readNullableString(raw.updated_at),
  };
}

export async function fetchExternalOperations(
  externalAccountUuid: string,
  signal?: AbortSignal,
): Promise<ExternalOperation[]> {
  const { rows, response } = await fetchAllRows(
    EXTERNAL_OPERATIONS_PATH,
    { external_account_uuid: guard.nonEmpty(externalAccountUuid, "external account uuid") },
    signal,
  );
  if (!response.ok) throw new Error(`External operations request failed (${response.status})`);
  return rows
    .map(mapExternalOperation)
    .filter((operation): operation is ExternalOperation => operation != null);
}

export async function retryExternalOperation(
  uuid: string,
  options: { confirmDuplicateRisk: boolean },
): Promise<ExternalAccountMutationResult<ExternalOperation>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${externalOperationPath(uuid)}/actions/retry/invoke`,
    options.confirmDuplicateRisk ? { confirm_duplicate_risk: true } : {},
  );
  if (!response.ok) return mutationFailure(response);
  const operation = mapExternalOperation(response.data);
  if (operation == null) return { ok: false, kind: "transient" };
  return { ok: true, value: operation };
}

export async function discardExternalOperation(
  uuid: string,
): Promise<ExternalAccountMutationResult<null>> {
  const response = await messengerApi.deleteWithBase(apiBase(), externalOperationPath(uuid));
  if (!response.ok) return mutationFailure(response);
  return { ok: true, value: null };
}

export async function preflightExternalOperation(
  input: ExternalOperationPreflightInput,
): Promise<ExternalAccountMutationResult<ExternalOperationPreflightResult>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${EXTERNAL_OPERATIONS_PATH}actions/preflight/invoke`,
    {
      external_account_uuid: guard.nonEmpty(input.externalAccountUuid, "external account uuid"),
      action: guard.nonEmpty(input.action, "external operation action"),
      target: {
        type: guard.nonEmpty(input.target.type, "external operation target type"),
        ...(input.target.uuid == null ? {} : { uuid: input.target.uuid }),
      },
    },
  );
  if (!response.ok) return mutationFailure(response);
  if (
    !isRecord(response.data) ||
    typeof response.data.allowed !== "boolean" ||
    typeof response.data.action !== "string" ||
    !isRecord(response.data.target) ||
    typeof response.data.target.type !== "string" ||
    (response.data.target.uuid != null && typeof response.data.target.uuid !== "string") ||
    !Array.isArray(response.data.losses) ||
    !response.data.losses.every(isRecord) ||
    typeof response.data.requires_confirmation !== "boolean"
  ) {
    return { ok: false, kind: "transient" };
  }
  return {
    ok: true,
    value: {
      allowed: response.data.allowed,
      action: response.data.action,
      target: {
        type: response.data.target.type,
        uuid: response.data.target.uuid ?? null,
      },
      losses: response.data.losses,
      requiresConfirmation: response.data.requires_confirmation,
    },
  };
}

function readProviderLimits(value: unknown): ExternalProviderLimits | null {
  if (!isRecord(value)) return null;
  const maxAccounts = readInteger(value.max_accounts, -1);
  const maxSelectedChatsPerAccount = readInteger(value.max_selected_chats_per_account, -1);
  const maxFileBytes = readInteger(value.max_file_bytes, -1);
  if (maxAccounts < 0 || maxSelectedChatsPerAccount < 0 || maxFileBytes < 0) return null;
  return { maxAccounts, maxSelectedChatsPerAccount, maxFileBytes };
}

function mapExternalProviderPolicy(
  raw: unknown,
  etag: string | null,
): ExternalProviderPolicy | null {
  if (!isRecord(raw) || raw.provider !== "zulip" || typeof raw.enabled !== "boolean") return null;
  const limits = readProviderLimits(raw.limits);
  if (limits == null) return null;
  let customCaBundle: ExternalProviderPolicy["customCaBundle"] = null;
  if (raw.custom_ca_bundle != null) {
    if (!isRecord(raw.custom_ca_bundle)) return null;
    const uuid = readString(raw.custom_ca_bundle.uuid);
    const sha256 = readString(raw.custom_ca_bundle.sha256);
    const generation = readInteger(raw.custom_ca_bundle.generation);
    const certificateCount = readInteger(raw.custom_ca_bundle.certificate_count);
    if (uuid == null || sha256 == null || generation < 1 || certificateCount < 1) return null;
    customCaBundle = { uuid, sha256, generation, certificateCount };
  }
  return {
    provider: "zulip",
    enabled: raw.enabled,
    emergencySuspended: raw.emergency_suspended === true,
    limits,
    customCaBundle,
    revision: readInteger(raw.revision, 1),
    etag,
  };
}

export async function fetchZulipExternalProviderPolicy(): Promise<ExternalProviderPolicy | null> {
  const response = await messengerApi.getWithBase(
    apiBase(),
    `${EXTERNAL_PROVIDER_POLICIES_PATH}zulip`,
  );
  if (response.status === 403) return null;
  if (!response.ok) throw new Error(`External provider policy request failed (${response.status})`);
  const policy = mapExternalProviderPolicy(response.data, readEtag(response.headers));
  if (policy == null) throw new Error("Invalid external provider policy response");
  return policy;
}

export async function updateZulipExternalProviderPolicy(
  input: UpdateExternalProviderPolicyInput,
): Promise<ExternalAccountMutationResult<ExternalProviderPolicy>> {
  const response = await messengerApi.putJsonWithBase(
    apiBase(),
    `${EXTERNAL_PROVIDER_POLICIES_PATH}zulip`,
    {
      settings: {
        kind: "zulip",
        enabled: input.enabled,
        limits: {
          max_accounts: input.limits.maxAccounts,
          max_selected_chats_per_account: input.limits.maxSelectedChatsPerAccount,
          max_file_bytes: input.limits.maxFileBytes,
        },
        custom_ca_bundle:
          input.customCaCertificatesPem == null
            ? null
            : { certificates_pem: input.customCaCertificatesPem },
      },
    },
    { "If-Match": guard.nonEmpty(input.policy.etag ?? "", "provider policy ETag") },
  );
  if (!response.ok) return mutationFailure(response);
  const policy = mapExternalProviderPolicy(response.data, readEtag(response.headers));
  return policy == null ? { ok: false, kind: "transient" } : { ok: true, value: policy };
}

export async function changeZulipExternalProviderSuspension(
  action: "suspend" | "resume",
): Promise<ExternalAccountMutationResult<ExternalProviderPolicy>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${EXTERNAL_PROVIDER_POLICIES_PATH}zulip/actions/${action}/invoke`,
    {},
  );
  if (!response.ok) return mutationFailure(response);
  const policy = mapExternalProviderPolicy(response.data, readEtag(response.headers));
  return policy == null ? { ok: false, kind: "transient" } : { ok: true, value: policy };
}

export async function fetchZulipExternalProviderHealth(): Promise<ExternalProviderHealth | null> {
  const response = await messengerApi.getWithBase(
    apiBase(),
    `${EXTERNAL_PROVIDER_HEALTH_PATH}zulip`,
  );
  if (response.status === 403) return null;
  if (!response.ok || !isRecord(response.data) || typeof response.data.status !== "string") {
    if (!response.ok)
      throw new Error(`External provider health request failed (${response.status})`);
    throw new Error("Invalid external provider health response");
  }
  return {
    provider: "zulip",
    status: response.data.status,
    accountCounts: readNumericMap(response.data.account_counts),
    bridgeCounts: readNumericMap(response.data.bridge_counts),
    operationCounts: readNumericMap(response.data.operation_counts),
    metrics: isRecord(response.data.metrics) ? response.data.metrics : {},
    updatedAt: readNullableString(response.data.updated_at),
  };
}

function readBridgeInstanceStatus(value: unknown): ExternalBridgeInstanceStatus | null {
  return value === "enrolling" ||
    value === "active" ||
    value === "degraded" ||
    value === "incompatible" ||
    value === "suspended" ||
    value === "revoked"
    ? value
    : null;
}

function mapExternalBridgeInstance(raw: unknown): ExternalBridgeInstance | null {
  if (!isRecord(raw) || raw.provider !== "zulip") return null;
  const uuid = readString(raw.uuid);
  const status = readBridgeInstanceStatus(raw.status);
  const identityGeneration = readInteger(raw.identity_generation);
  if (uuid == null || status == null || identityGeneration < 1) return null;
  return {
    uuid,
    provider: "zulip",
    identityGeneration,
    status,
    capabilities: isRecord(raw.capabilities) ? raw.capabilities : {},
    lastHeartbeatAt: readNullableString(raw.last_heartbeat_at),
    certificateNotAfter: readNullableString(raw.certificate_not_after),
    safeError: readNullableString(raw.safe_error),
    revision: readInteger(raw.revision, 1),
  };
}

export async function fetchZulipExternalBridgeInstances(): Promise<
  ExternalBridgeInstance[] | null
> {
  const firstResponse = await messengerApi.getWithBase(apiBase(), EXTERNAL_BRIDGE_INSTANCES_PATH);
  const { rows, response } = await fetchAllRows(
    EXTERNAL_BRIDGE_INSTANCES_PATH,
    undefined,
    undefined,
    firstResponse,
  );
  if (response.status === 403) return null;
  if (!response.ok)
    throw new Error(`External bridge instances request failed (${response.status})`);
  return rows
    .map(mapExternalBridgeInstance)
    .filter((instance): instance is ExternalBridgeInstance => instance != null);
}

export type ExternalRealtimeUpdate =
  | { resource: "account"; action: "upsert"; value: ZulipExternalAccount }
  | { resource: "account"; action: "delete"; uuid: string }
  | { resource: "chat"; action: "upsert"; value: ExternalChat }
  | { resource: "chat"; action: "delete"; uuid: string }
  | { resource: "operation"; action: "upsert"; value: ExternalOperation }
  | { resource: "operation"; action: "delete"; uuid: string };

export function parseExternalRealtimeUpdate(
  payload: WorkspaceEventPayload,
): ExternalRealtimeUpdate | null {
  const uuid = readString(payload.uuid);
  if (uuid == null || !isRecord(payload.snapshot)) return null;
  const snapshot = { ...payload.snapshot, uuid };
  const deleted = payload.kind.endsWith(".deleted");
  if (payload.kind.startsWith("external_account.")) {
    if (deleted) return { resource: "account", action: "delete", uuid };
    const value = mapZulipExternalAccount(snapshot, null);
    return value == null ? null : { resource: "account", action: "upsert", value };
  }
  if (payload.kind.startsWith("external_chat.")) {
    if (deleted) return { resource: "chat", action: "delete", uuid };
    const value = mapExternalChat(snapshot);
    return value == null ? null : { resource: "chat", action: "upsert", value };
  }
  if (payload.kind.startsWith("external_operation.")) {
    if (deleted) return { resource: "operation", action: "delete", uuid };
    const value = mapExternalOperation(snapshot);
    return value == null ? null : { resource: "operation", action: "upsert", value };
  }
  return null;
}

export async function changeExternalBridgeInstanceStatus(
  uuid: string,
  action: "suspend" | "resume" | "revoke",
): Promise<ExternalAccountMutationResult<ExternalBridgeInstance>> {
  const response = await messengerApi.postJsonWithBase(
    apiBase(),
    `${EXTERNAL_BRIDGE_INSTANCES_PATH}${encodeURIComponent(
      guard.nonEmpty(uuid, "bridge instance uuid"),
    )}/actions/${action}/invoke`,
    {},
  );
  if (!response.ok) return mutationFailure(response);
  const instance = mapExternalBridgeInstance(response.data);
  return instance == null ? { ok: false, kind: "transient" } : { ok: true, value: instance };
}

export function logExternalAccountRefreshFailure(error: unknown): void {
  log.warn("External account refresh failed", { error: String(error) });
}
