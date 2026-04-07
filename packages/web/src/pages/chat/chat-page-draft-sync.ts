import type { Draft, DraftInput, DraftType } from "~/entities/draft/draft.types";

interface SyncExistingDraftDeleteOnCleanupOptions {
  draft: Draft | undefined;
  existingId: number | null;
  draftType: DraftType;
  draftTo: number[];
  draftTopic: string;
  deleteDraftOnServer: (id: number) => Promise<boolean>;
  removeDraftForChat: (type: DraftType, to: number[], topic?: string) => void;
  restoreDraft: (draft: Draft) => void;
  setActiveDraftId: (id: number | null) => void;
}

interface SyncExistingDraftDeleteOnClearOptions extends SyncExistingDraftDeleteOnCleanupOptions {
  shouldRestoreDraft: () => boolean;
}

interface SyncExistingDraftUpdateOnCleanupOptions {
  draft: Draft | undefined;
  existingId: number;
  draftType: DraftType;
  draftTo: number[];
  draftTopic: string;
  nextContent: string;
  updateDraft: (id: number, patch: Partial<Pick<Draft, "content" | "topic" | "to">>) => void;
  restoreDraft: (draft: Draft) => void;
  updateDraftOnServer: (id: number, input: DraftInput) => Promise<boolean>;
}

interface ReconcileCreatedDraftServerIdOptions {
  serverId: number | null;
  draftType: DraftType;
  draftTo: number[];
  draftTopic: string;
  getDraftForChat: (type: DraftType, to: number[], topic?: string) => Draft | undefined;
  linkDraftToServerId: (type: DraftType, to: number[], topic: string, newId: number) => void;
  deleteDraftOnServer: (id: number) => Promise<boolean>;
}

export async function syncExistingDraftDeleteOnCleanup({
  draft,
  existingId,
  draftType,
  draftTo,
  draftTopic,
  deleteDraftOnServer,
  removeDraftForChat,
  restoreDraft,
  setActiveDraftId,
}: SyncExistingDraftDeleteOnCleanupOptions): Promise<boolean> {
  return syncExistingDraftDeleteInternal({
    draft,
    existingId,
    draftType,
    draftTo,
    draftTopic,
    deleteDraftOnServer,
    removeDraftForChat,
    restoreDraft,
    setActiveDraftId,
    shouldRestoreDraft: () => true,
  });
}

export async function syncExistingDraftDeleteOnClear({
  draft,
  existingId,
  draftType,
  draftTo,
  draftTopic,
  deleteDraftOnServer,
  removeDraftForChat,
  restoreDraft,
  setActiveDraftId,
  shouldRestoreDraft,
}: SyncExistingDraftDeleteOnClearOptions): Promise<boolean> {
  return syncExistingDraftDeleteInternal({
    draft,
    existingId,
    draftType,
    draftTo,
    draftTopic,
    deleteDraftOnServer,
    removeDraftForChat,
    restoreDraft,
    setActiveDraftId,
    shouldRestoreDraft,
  });
}

async function syncExistingDraftDeleteInternal({
  draft,
  existingId,
  draftType,
  draftTo,
  draftTopic,
  deleteDraftOnServer,
  removeDraftForChat,
  restoreDraft,
  setActiveDraftId,
  shouldRestoreDraft,
}: SyncExistingDraftDeleteOnClearOptions): Promise<boolean> {
  if (draft != null) {
    removeDraftForChat(draftType, draftTo, draftTopic);
  }

  if (existingId == null) return true;

  const deleted = await deleteDraftOnServer(existingId);
  if (!deleted && draft != null && shouldRestoreDraft()) {
    restoreDraft(draft);
    return false;
  }
  if (!deleted) return false;

  setActiveDraftId(null);
  return true;
}

export async function syncExistingDraftUpdateOnCleanup({
  draft,
  existingId,
  draftType,
  draftTo,
  draftTopic,
  nextContent,
  updateDraft,
  restoreDraft,
  updateDraftOnServer,
}: SyncExistingDraftUpdateOnCleanupOptions): Promise<boolean> {
  if (draft?.content === nextContent) return true;

  if (draft != null) {
    updateDraft(existingId, { content: nextContent });
  }
  const updated = await updateDraftOnServer(existingId, {
    type: draftType,
    to: draftTo,
    topic: draftTopic,
    content: nextContent,
  });

  if (!updated && draft != null) {
    restoreDraft(draft);
    return false;
  }
  if (!updated) return false;

  return true;
}

export async function reconcileCreatedDraftServerId({
  serverId,
  draftType,
  draftTo,
  draftTopic,
  getDraftForChat,
  linkDraftToServerId,
  deleteDraftOnServer,
}: ReconcileCreatedDraftServerIdOptions): Promise<void> {
  if (serverId == null) return;

  const localDraft = getDraftForChat(draftType, draftTo, draftTopic);
  if (localDraft == null || localDraft.content.trim() === "") {
    await deleteDraftOnServer(serverId);
    return;
  }

  if (localDraft.id == null) {
    linkDraftToServerId(draftType, draftTo, draftTopic, serverId);
    return;
  }

  if (localDraft.id !== serverId) {
    await deleteDraftOnServer(serverId);
  }
}
