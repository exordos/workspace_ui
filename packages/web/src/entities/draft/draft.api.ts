/** IAM-authenticated Workspace messenger Draft API client. */

import {
  getMessengerGatewayApiBaseForCurrentInstance,
  messengerApi,
  type ApiResponse,
} from "~/shared/api/client";
import { WorkspaceApiHttpError } from "~/shared/api/workspace-orval-mutator";
import type {
  Draft,
  DraftConflictSnapshot,
  DraftCreateInput,
  DraftListFilters,
  DraftPage,
  DraftPayload,
  DraftUpdateInput,
} from "./draft.types";

const DRAFTS_PATH = "/drafts/";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value.toLowerCase();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error("Invalid draft revision");
  }
  return Number(value);
}

function normalizeEtag(value: string | null, revision: number): string {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : `"${revision}"`;
}

function parsePayload(value: unknown): DraftPayload {
  if (!isRecord(value) || value.kind !== "markdown" || typeof value.content !== "string") {
    throw new Error("Invalid draft payload");
  }
  return { ...value, kind: "markdown", content: value.content };
}

export function parseDraftSnapshot(value: unknown, etag: string | null = null): Draft {
  if (!isRecord(value)) {
    throw new Error("Invalid draft snapshot");
  }
  const revision = requireRevision(value.revision);
  return {
    uuid: requireUuid(value.uuid, "draft uuid"),
    project_id: requireUuid(value.project_id, "draft project_id"),
    user_uuid: requireUuid(value.user_uuid, "draft user_uuid"),
    stream_uuid: requireUuid(value.stream_uuid, "draft stream_uuid"),
    topic_uuid: requireUuid(value.topic_uuid, "draft topic_uuid"),
    payload: parsePayload(value.payload),
    revision,
    created_at: requireString(value.created_at, "draft created_at"),
    updated_at: requireString(value.updated_at, "draft updated_at"),
    etag: normalizeEtag(etag, revision),
    sync_state: "synced",
  };
}

function validateDraftInput(input: DraftCreateInput | DraftUpdateInput): void {
  parsePayload(input.payload);
  if ("uuid" in input) {
    requireUuid(input.uuid, "draft uuid");
    requireUuid(input.stream_uuid, "draft stream_uuid");
    requireUuid(input.topic_uuid, "draft topic_uuid");
  }
}

function assertOk(res: ApiResponse): void {
  if (res.ok) return;
  const statusText = res.raw.statusText ? ` ${res.raw.statusText}` : "";
  throw new WorkspaceApiHttpError(
    `Workspace Draft API error: ${res.status}${statusText}`,
    res.status,
    res.data,
    res.headers,
  );
}

function parseConflictSnapshot(error: WorkspaceApiHttpError): DraftConflictSnapshot {
  const body = isRecord(error.data) ? error.data : null;
  const rawDraft = body?.current ?? body?.draft ?? body?.resource ?? body;
  const etag = error.headers?.get("ETag") ?? null;
  if (rawDraft == null) {
    return { draft: null, etag };
  }
  try {
    const draft = parseDraftSnapshot(rawDraft, etag);
    return { draft, etag: draft.etag };
  } catch {
    return { draft: null, etag };
  }
}

export class DraftPreconditionError extends WorkspaceApiHttpError {
  readonly current: DraftConflictSnapshot;

  constructor(error: WorkspaceApiHttpError) {
    super(error.message, error.status, error.data, error.headers);
    this.name = "DraftPreconditionError";
    this.current = parseConflictSnapshot(error);
  }
}

function throwDraftError(res: ApiResponse): never {
  try {
    assertOk(res);
  } catch (error) {
    if (error instanceof WorkspaceApiHttpError && (error.status === 412 || error.status === 428)) {
      throw new DraftPreconditionError(error);
    }
    throw error;
  }
  throw new Error("Unreachable");
}

function base(): string {
  return getMessengerGatewayApiBaseForCurrentInstance();
}

function draftPath(uuid: string): string {
  return `${DRAFTS_PATH}${encodeURIComponent(requireUuid(uuid, "draft uuid"))}`;
}

function listParams(filters: DraftListFilters): Record<string, string> {
  const params: Record<string, string> = {
    sort_key: "updated_at",
    sort_dir: "desc",
  };
  if (filters.streamUuid != null)
    params.stream_uuid = requireUuid(filters.streamUuid, "streamUuid");
  if (filters.topicUuid != null) params.topic_uuid = requireUuid(filters.topicUuid, "topicUuid");
  if (filters.pageMarker != null) params.page_marker = filters.pageMarker;
  if (filters.pageLimit != null) params.page_limit = String(filters.pageLimit);
  return params;
}

export async function fetchDraftsPage(
  filters: DraftListFilters = {},
  signal?: AbortSignal,
): Promise<DraftPage> {
  const res = await messengerApi.getWithBase(base(), DRAFTS_PATH, listParams(filters), signal);
  if (!res.ok) throwDraftError(res);
  if (!Array.isArray(res.data)) {
    throw new Error("Invalid drafts list response");
  }
  return {
    drafts: res.data.map((row) => parseDraftSnapshot(row)),
    nextPageMarker: res.headers.get("X-Pagination-Marker"),
  };
}

export async function fetchAllDrafts(signal?: AbortSignal): Promise<Draft[]> {
  const drafts: Draft[] = [];
  let pageMarker: string | undefined;
  do {
    const page = await fetchDraftsPage({ pageLimit: 100, pageMarker }, signal);
    drafts.push(...page.drafts);
    pageMarker = page.nextPageMarker ?? undefined;
  } while (pageMarker != null);
  return drafts;
}

export async function fetchDraft(uuid: string, signal?: AbortSignal): Promise<Draft> {
  const res = await messengerApi.getWithBase(base(), draftPath(uuid), undefined, signal);
  if (!res.ok) throwDraftError(res);
  return parseDraftSnapshot(res.data, res.headers.get("ETag"));
}

export async function createDraft(input: DraftCreateInput): Promise<Draft> {
  validateDraftInput(input);
  const res = await messengerApi.postJsonWithBase(base(), DRAFTS_PATH, input);
  if (!res.ok) throwDraftError(res);
  return parseDraftSnapshot(res.data, res.headers.get("ETag"));
}

export async function updateDraftOnServer(
  uuid: string,
  input: DraftUpdateInput,
  etag: string,
): Promise<Draft> {
  validateDraftInput(input);
  const res = await messengerApi.putJsonWithBase(base(), draftPath(uuid), input, {
    "If-Match": etag,
  });
  if (!res.ok) throwDraftError(res);
  return parseDraftSnapshot(res.data, res.headers.get("ETag"));
}

export async function deleteDraftOnServer(uuid: string, etag: string): Promise<void> {
  const res = await messengerApi.deleteWithBase(base(), draftPath(uuid), undefined, {
    "If-Match": etag,
  });
  if (!res.ok) throwDraftError(res);
}
