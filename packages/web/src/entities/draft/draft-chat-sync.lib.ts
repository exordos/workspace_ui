import { WorkspaceApiHttpError } from "~/shared/api/workspace-orval-mutator";
import {
  DraftPreconditionError,
  createDraft,
  deleteDraftOnServer,
  updateDraftOnServer,
} from "./draft.api";
import type { Draft } from "./draft.types";

export interface DraftSyncResult {
  status: "synced" | "deleted" | "conflict";
  needsResync: boolean;
}

export interface SyncDraftContentOptions {
  uuid: string;
  streamUuid: string;
  topicUuid: string;
  content: string;
  getDraft: (uuid: string) => Draft | undefined;
  getCurrentContent: () => string;
  upsertDraft: (draft: Draft) => void;
  updateDraftPayload: (uuid: string, content: string, syncState?: Draft["sync_state"]) => void;
  markDraftConflict: (uuid: string, current: Draft | null) => void;
  removeDraft: (uuid: string) => void;
}

export interface FinalizeSentDraftOptions {
  uuid: string;
  streamUuid: string;
  topicUuid: string;
  sentContent: string;
  getDraft: (uuid: string) => Draft | undefined;
  upsertDraft: (draft: Draft) => void;
  updateDraftPayload: (uuid: string, content: string, syncState?: Draft["sync_state"]) => void;
  markDraftConflict: (uuid: string, current: Draft | null) => void;
  removeDraft: (uuid: string) => void;
}

export type FinalizeSentDraftStatus = "deleted" | "preserved" | "conflict" | "missing";

export function createPendingDraft(options: {
  uuid: string;
  streamUuid: string;
  topicUuid: string;
  content: string;
}): Draft {
  const now = new Date().toISOString();
  return {
    uuid: options.uuid,
    project_id: "",
    user_uuid: "",
    stream_uuid: options.streamUuid,
    topic_uuid: options.topicUuid,
    payload: { kind: "markdown", content: options.content },
    revision: 0,
    created_at: now,
    updated_at: now,
    etag: '"0"',
    sync_state: "pending",
  };
}

function applyServerSnapshotWithoutLosingNewerInput(
  snapshot: Draft,
  requestedContent: string,
  options: SyncDraftContentOptions,
): boolean {
  options.upsertDraft(snapshot);
  const currentContent = options.getCurrentContent();
  if (currentContent === requestedContent) {
    return false;
  }
  options.updateDraftPayload(snapshot.uuid, currentContent, "pending");
  return true;
}

export async function syncDraftContent(options: SyncDraftContentOptions): Promise<DraftSyncResult> {
  const content = options.content;
  const existing = options.getDraft(options.uuid);

  if (content.trim().length === 0) {
    if (existing == null || existing.project_id === "") {
      options.removeDraft(options.uuid);
      return { status: "deleted", needsResync: false };
    }
    try {
      await deleteDraftOnServer(existing.uuid, existing.etag);
      options.removeDraft(existing.uuid);
      return {
        status: "deleted",
        needsResync: options.getCurrentContent().trim().length > 0,
      };
    } catch (error) {
      if (error instanceof DraftPreconditionError) {
        options.markDraftConflict(existing.uuid, error.current.draft);
        return { status: "conflict", needsResync: false };
      }
      throw error;
    }
  }

  if (existing?.sync_state === "conflict") {
    return { status: "conflict", needsResync: false };
  }

  const createInput = {
    stream_uuid: options.streamUuid,
    topic_uuid: options.topicUuid,
    payload: { kind: "markdown" as const, content },
  };

  try {
    const snapshot =
      existing == null || existing.project_id === ""
        ? await createDraft({ uuid: options.uuid, ...createInput })
        : await updateDraftOnServer(existing.uuid, { payload: createInput.payload }, existing.etag);
    const needsResync = applyServerSnapshotWithoutLosingNewerInput(snapshot, content, options);
    return { status: "synced", needsResync };
  } catch (error) {
    if (error instanceof DraftPreconditionError) {
      options.markDraftConflict(options.uuid, error.current.draft);
      return { status: "conflict", needsResync: false };
    }
    throw error;
  }
}

/** Deletes exactly the server draft consumed by a successful send and preserves concurrent edits. */
export async function finalizeDraftAfterSuccessfulSend(
  options: FinalizeSentDraftOptions,
): Promise<FinalizeSentDraftStatus> {
  const existing = options.getDraft(options.uuid);
  if (existing == null) return "missing";
  if (existing.payload.content !== options.sentContent) return "preserved";

  if (existing.project_id === "") {
    options.removeDraft(existing.uuid);
    return "deleted";
  }

  try {
    await deleteDraftOnServer(existing.uuid, existing.etag);
  } catch (error) {
    if (error instanceof WorkspaceApiHttpError && error.status === 404) {
      // The authoritative draft is already absent. Reconcile local state exactly as after a
      // successful idempotent DELETE, including preservation of concurrent local edits below.
    } else if (error instanceof DraftPreconditionError) {
      options.markDraftConflict(existing.uuid, error.current.draft);
      return "conflict";
    } else {
      throw error;
    }
  }

  const current = options.getDraft(existing.uuid);
  if (current == null || current.payload.content === options.sentContent) {
    options.removeDraft(existing.uuid);
    return "deleted";
  }

  const newerContent = current.payload.content;
  options.upsertDraft(
    createPendingDraft({
      uuid: existing.uuid,
      streamUuid: options.streamUuid,
      topicUuid: options.topicUuid,
      content: newerContent,
    }),
  );
  const recreated = await createDraft({
    uuid: existing.uuid,
    stream_uuid: options.streamUuid,
    topic_uuid: options.topicUuid,
    payload: { kind: "markdown", content: newerContent },
  });
  const latest = options.getDraft(existing.uuid);
  options.upsertDraft(recreated);
  if (latest != null && latest.payload.content !== newerContent) {
    options.updateDraftPayload(existing.uuid, latest.payload.content, "pending");
  }
  return "preserved";
}
