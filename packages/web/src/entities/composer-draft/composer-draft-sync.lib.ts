import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createDraft, deleteDraft, updateDraft } from "~/shared/api/messenger-drafts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { isWorkspaceMessengerDraftDto } from "~/shared/api/messenger.types";
import type { WorkspaceMessengerDraftDto } from "~/shared/api/messenger.types";
import {
  normalizeWorkspaceComposerDraftContent,
  normalizeWorkspaceComposerDraftRemoteText,
} from "./composer-draft.lib";
import { useWorkspaceComposerDraftStore } from "./composer-draft.model";
import type { WorkspaceComposerDraft } from "./composer-draft.types";

const REMOTE_DRAFT_DEBOUNCE_MS = 1_000;

type SaveOutcome = "saved" | "retry" | "failed";
type DeleteOutcome = "deleted" | "created" | "retry" | "failed";

interface RemoteDraftJob {
  key: string;
  ownerKey: string;
  draftUuid: string;
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  deleteRequested: boolean;
}

const remoteJobs = new Map<string, RemoteDraftJob>();

function remoteJobKey(ownerKey: string, draftUuid: string): string {
  return `${ownerKey}:${draftUuid}`;
}

function isJobCurrent(job: RemoteDraftJob): boolean {
  return !isWorkspaceRuntimeRequestInvalidated(job.runtimeContext, job.getRuntimeContext);
}

function currentDraft(job: RemoteDraftJob): WorkspaceComposerDraft | null {
  return useWorkspaceComposerDraftStore.getState().draftsByKey[job.key] ?? null;
}

function isServerDraftable(draft: WorkspaceComposerDraft): boolean {
  return (
    draft.content.text.trim().length > 0 &&
    draft.streamUuid.length > 0 &&
    draft.topicUuid.length > 0
  );
}

function isDraftConflict(
  error: unknown,
): error is MessengerApiError & { data: WorkspaceMessengerDraftDto } {
  return (
    error instanceof MessengerApiError &&
    error.status === 412 &&
    isWorkspaceMessengerDraftDto(error.data)
  );
}

function isNotFoundError(error: unknown): error is MessengerApiError {
  return error instanceof MessengerApiError && error.status === 404;
}

function isRetryableDraftError(error: unknown): boolean {
  if (!(error instanceof MessengerApiError)) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function resolveJob(job: RemoteDraftJob): void {
  if (job.timer != null) clearTimeout(job.timer);
  job.timer = null;
  if (remoteJobs.get(job.key) === job) remoteJobs.delete(job.key);
}

function markFailed(job: RemoteDraftJob): void {
  useWorkspaceComposerDraftStore.getState().markDraftSyncFailed(job.ownerKey, job.draftUuid);
}

function markConflict(
  job: RemoteDraftJob,
  error: MessengerApiError & { data: WorkspaceMessengerDraftDto },
): void {
  useWorkspaceComposerDraftStore.getState().markDraftConflict(
    job.ownerKey,
    job.draftUuid,
    normalizeWorkspaceComposerDraftContent({
      text: error.data.payload.content,
      replySession: {},
    }),
    error.headers.get("ETag") ?? `"${error.data.revision}"`,
  );
}

function reconcileMatchingDeleteConflict(
  job: RemoteDraftJob,
  error: MessengerApiError & { data: WorkspaceMessengerDraftDto },
): boolean {
  const current = currentDraft(job);
  if (
    current?.syncStatus !== "deleting" ||
    normalizeWorkspaceComposerDraftRemoteText(current.content.text) !==
      normalizeWorkspaceComposerDraftRemoteText(error.data.payload.content)
  ) {
    return false;
  }
  useWorkspaceComposerDraftStore
    .getState()
    .applyDraftSyncSuccess(job.ownerKey, job.draftUuid, current.snapshotId, {
      etag: error.headers.get("ETag") ?? `"${error.data.revision}"`,
      updatedAt: error.data.updated_at,
    });
  return true;
}

async function saveLatestDraft(
  job: RemoteDraftJob,
  draft: WorkspaceComposerDraft,
): Promise<SaveOutcome> {
  if (!isJobCurrent(job) || !isServerDraftable(draft)) return "failed";

  const creating = draft.etag == null;
  // A timeout can happen after the server has created the draft. Keep its first
  // payload stable for idempotent POST retries; newer local text follows as PUT.
  const createPayload = creating ? (draft.pendingCreatePayload ?? draft.content.text) : null;
  const isDeleteCreate = job.deleteRequested && draft.etag == null;
  if (!isDeleteCreate) {
    const syncing = useWorkspaceComposerDraftStore
      .getState()
      .markDraftSyncing(
        job.ownerKey,
        job.draftUuid,
        creating ? "create" : "update",
        createPayload ?? undefined,
      );
    if (syncing == null) return "failed";
  }

  try {
    const options = buildMessengerRequestOptions(job.runtimeContext);
    let server;
    if (creating) {
      server = await createDraft(options, {
        uuid: draft.draftUuid,
        stream_uuid: draft.streamUuid,
        topic_uuid: draft.topicUuid,
        payload: { kind: "markdown", content: createPayload ?? "" },
      });
    } else {
      const etag = draft.etag;
      if (etag == null) return "failed";
      server = await updateDraft(
        options,
        draft.draftUuid,
        { payload: { kind: "markdown", content: draft.content.text } },
        etag,
      );
    }
    if (!isJobCurrent(job)) return "failed";
    // A successful response confirms the payload that this request sent. The
    // server may return canonicalized markdown, so comparing against its echoed
    // content can keep the same local snapshot dirty and cause an endless PUT loop.
    const sentContent = createPayload ?? draft.content.text;
    const sentRemoteText = normalizeWorkspaceComposerDraftRemoteText(sentContent);
    const current = currentDraft(job);
    const syncedSnapshotId =
      current != null &&
      normalizeWorkspaceComposerDraftRemoteText(current.content.text) === sentRemoteText
        ? current.snapshotId
        : normalizeWorkspaceComposerDraftRemoteText(draft.content.text) === sentRemoteText
          ? draft.snapshotId
          : `create-payload:${job.draftUuid}:${server.draft.revision}`;
    useWorkspaceComposerDraftStore
      .getState()
      .applyDraftSyncSuccess(job.ownerKey, job.draftUuid, syncedSnapshotId, {
        etag: server.etag,
        updatedAt: server.draft.updated_at,
      });
    return "saved";
  } catch (error) {
    if (!isJobCurrent(job)) return "failed";
    if (isDraftConflict(error)) {
      const current = currentDraft(job);
      if (!creating && current?.content.text === error.data.payload.content) {
        useWorkspaceComposerDraftStore
          .getState()
          .applyDraftSyncSuccess(job.ownerKey, job.draftUuid, current.snapshotId, {
            etag: error.headers.get("ETag") ?? `"${error.data.revision}"`,
            updatedAt: error.data.updated_at,
          });
        return "saved";
      }
      markConflict(job, error);
      return "failed";
    }
    if (isRetryableDraftError(error)) return "retry";
    markFailed(job);
    return "failed";
  }
}

async function deleteLatestDraft(job: RemoteDraftJob): Promise<DeleteOutcome> {
  if (!isJobCurrent(job)) return "failed";
  const deleting = useWorkspaceComposerDraftStore
    .getState()
    .markDraftDeleting(job.ownerKey, job.draftUuid);
  if (deleting == null) return "failed";
  // Persist the tombstone before any server request can make a reload race
  // against the debounced IndexedDB write and restore already-sent content.
  await useWorkspaceComposerDraftStore.getState().flushDraft(job.ownerKey, job.draftUuid);
  if (!isJobCurrent(job)) return "failed";

  if (deleting.etag == null) {
    if (!isServerDraftable(deleting)) {
      useWorkspaceComposerDraftStore.getState().removeDraftByUuid(job.ownerKey, job.draftUuid);
      return "deleted";
    }
    const saved = await saveLatestDraft(job, deleting);
    return saved === "saved" ? "created" : saved;
  }

  try {
    await deleteDraft(
      buildMessengerRequestOptions(job.runtimeContext),
      deleting.draftUuid,
      deleting.etag,
    );
    if (!isJobCurrent(job)) return "failed";
    useWorkspaceComposerDraftStore.getState().removeDraftByUuid(job.ownerKey, job.draftUuid);
    return "deleted";
  } catch (error) {
    if (!isJobCurrent(job)) return "failed";
    if (isNotFoundError(error)) {
      useWorkspaceComposerDraftStore.getState().removeDraftByUuid(job.ownerKey, job.draftUuid);
      return "deleted";
    }
    if (isDraftConflict(error)) {
      if (reconcileMatchingDeleteConflict(job, error)) return "created";
      markConflict(job, error);
      return "failed";
    }
    if (isRetryableDraftError(error)) return "retry";
    markFailed(job);
    return "failed";
  }
}

async function runJob(job: RemoteDraftJob): Promise<void> {
  if (job.running) return;
  job.running = true;
  job.timer = null;
  try {
    while (remoteJobs.get(job.key) === job) {
      if (!isJobCurrent(job)) {
        resolveJob(job);
        return;
      }
      const draft = currentDraft(job);
      if (draft == null || draft.syncStatus === "conflict") {
        resolveJob(job);
        return;
      }

      if (job.deleteRequested) {
        const outcome = await deleteLatestDraft(job);
        if (outcome === "retry" && remoteJobs.get(job.key) === job) {
          scheduleJob(job, REMOTE_DRAFT_DEBOUNCE_MS);
          return;
        }
        if (outcome === "failed" || remoteJobs.get(job.key) !== job) {
          resolveJob(job);
          return;
        }
        if (outcome === "deleted" || currentDraft(job) == null) {
          resolveJob(job);
          return;
        }
        // A draft without ETag has just been created. The next iteration uses
        // the returned ETag to issue the actual delete.
        continue;
      }

      if (!isServerDraftable(draft)) {
        resolveJob(job);
        return;
      }
      const outcome = await saveLatestDraft(job, draft);
      if (outcome === "retry" && remoteJobs.get(job.key) === job) {
        scheduleJob(job, REMOTE_DRAFT_DEBOUNCE_MS);
        return;
      }
      if (outcome === "failed" || remoteJobs.get(job.key) !== job) {
        resolveJob(job);
        return;
      }
      const latest = currentDraft(job);
      if (latest == null || latest.syncStatus === "conflict") {
        resolveJob(job);
        return;
      }
      if (job.deleteRequested || latest.syncStatus !== "saved") continue;
      resolveJob(job);
      return;
    }
  } finally {
    job.running = false;
  }
}

function scheduleJob(job: RemoteDraftJob, delay: number): void {
  if (job.timer != null) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    void runJob(job);
  }, delay);
}

function getOrCreateJob(params: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  draft: WorkspaceComposerDraft;
}): RemoteDraftJob | null {
  const ownerKey = workspaceRuntimeOwnerKey(params.runtimeContext);
  if (ownerKey !== params.draft.ownerKey) return null;
  const key = remoteJobKey(ownerKey, params.draft.draftUuid);
  const existing = remoteJobs.get(key);
  if (existing != null) {
    existing.runtimeContext = params.runtimeContext;
    existing.getRuntimeContext = params.getRuntimeContext;
    return existing;
  }
  const job: RemoteDraftJob = {
    key,
    ownerKey,
    draftUuid: params.draft.draftUuid,
    runtimeContext: params.runtimeContext,
    getRuntimeContext: params.getRuntimeContext,
    timer: null,
    running: false,
    deleteRequested: false,
  };
  remoteJobs.set(key, job);
  return job;
}

// The queue belongs to the entity module rather than a chat component. It
// writes only after local input settles and serializes every operation by UUID.
export function syncWorkspaceComposerDraft(params: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  draft: WorkspaceComposerDraft;
}): void {
  if (params.draft.syncStatus === "saved" || params.draft.syncStatus === "conflict") return;
  const job = getOrCreateJob(params);
  if (job == null || !isJobCurrent(job)) return;
  if (!job.running) scheduleJob(job, REMOTE_DRAFT_DEBOUNCE_MS);
}

export function deleteWorkspaceComposerDraftFromServer(params: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  draft: WorkspaceComposerDraft;
}): boolean {
  const job = getOrCreateJob(params);
  if (job == null || !isJobCurrent(job)) return false;
  job.deleteRequested = true;
  useWorkspaceComposerDraftStore.getState().markDraftDeleting(job.ownerKey, job.draftUuid);
  if (!job.running) scheduleJob(job, 0);
  return true;
}

// Bootstrap resumes durable local operations without another drafts read. Chat
// navigation never calls this helper, so opening a conversation stays cache-only.
export function resumeWorkspaceComposerDraftSync(params: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
}): void {
  const { runtimeContext, getRuntimeContext } = params;
  if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext)) return;
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const drafts = Object.values(useWorkspaceComposerDraftStore.getState().draftsByKey).filter(
    (draft) =>
      draft.ownerKey === ownerKey &&
      (draft.syncStatus === "local" ||
        draft.syncStatus === "saving" ||
        draft.syncStatus === "deleting"),
  );
  for (const draft of drafts) {
    if (draft.syncStatus === "deleting") {
      void deleteWorkspaceComposerDraftFromServer({ runtimeContext, getRuntimeContext, draft });
      continue;
    }
    void syncWorkspaceComposerDraft({ runtimeContext, getRuntimeContext, draft });
  }
}

export function resetWorkspaceComposerDraftSyncForTests(): void {
  for (const job of remoteJobs.values()) {
    if (job.timer != null) clearTimeout(job.timer);
  }
  remoteJobs.clear();
}
