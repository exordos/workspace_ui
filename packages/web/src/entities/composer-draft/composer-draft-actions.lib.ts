import {
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { loadWorkspaceComposerDrafts } from "./composer-draft-loader.lib";
import {
  deleteWorkspaceComposerDraftFromServer,
  syncWorkspaceComposerDraft,
} from "./composer-draft-sync.lib";
import { useWorkspaceComposerDraftStore } from "./composer-draft.model";

export interface WorkspaceComposerDraftActionContext {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
}

export async function refreshWorkspaceComposerDrafts(
  context: WorkspaceComposerDraftActionContext,
): Promise<void> {
  await loadWorkspaceComposerDrafts(context);
}

export function acceptWorkspaceComposerDraftServerVersion(
  ownerKey: string,
  draftUuid: string,
): boolean {
  return (
    useWorkspaceComposerDraftStore
      .getState()
      .acceptDraftConflictServerVersion(ownerKey, draftUuid) != null
  );
}

export function keepWorkspaceComposerDraftLocalVersion(
  context: WorkspaceComposerDraftActionContext,
  draftUuid: string,
): boolean {
  const ownerKey = workspaceRuntimeOwnerKey(context.runtimeContext);
  const draft = useWorkspaceComposerDraftStore
    .getState()
    .retryDraftConflictWithLocalVersion(ownerKey, draftUuid);
  if (draft == null) return false;
  syncWorkspaceComposerDraft({ ...context, draft });
  return true;
}

export function deleteWorkspaceComposerDraft(
  context: WorkspaceComposerDraftActionContext,
  draftUuid: string,
): boolean {
  const ownerKey = workspaceRuntimeOwnerKey(context.runtimeContext);
  const store = useWorkspaceComposerDraftStore.getState();
  const existing = store.draftsByKey[`${ownerKey}:${draftUuid}`];
  if (existing == null) return false;
  return deleteWorkspaceComposerDraftFromServer({ ...context, draft: existing });
}
