import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getDraftsPage } from "~/shared/api/messenger-drafts.api";
import { resumeWorkspaceComposerDraftSync } from "./composer-draft-sync.lib";
import { EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION } from "./composer-draft.lib";
import { useWorkspaceComposerDraftStore } from "./composer-draft.model";
import type { WorkspaceComposerDraft } from "./composer-draft.types";

function toComposerDraft(
  ownerKey: string,
  snapshot: Awaited<ReturnType<typeof getDraftsPage>>["items"][number],
): WorkspaceComposerDraft {
  const { draft, etag } = snapshot;
  const conversationId = `topic:${draft.stream_uuid}:${draft.topic_uuid}`;
  return {
    key: `${ownerKey}:${draft.uuid}`,
    draftUuid: draft.uuid,
    ownerKey,
    conversationId,
    streamUuid: draft.stream_uuid,
    topicUuid: draft.topic_uuid,
    snapshotId: `server-draft:${draft.uuid}:${draft.revision}`,
    content: {
      text: draft.payload.content,
      replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
    },
    etag,
    syncStatus: "saved",
    serverUpdatedAt: draft.updated_at,
    pendingCreatePayload: null,
    updatedAt: Date.parse(draft.updated_at),
  };
}

// This loader is intentionally used only by the messenger bootstrap and the
// explicit Drafts page. Chat navigation reads the already populated store.
export async function loadWorkspaceComposerDrafts(params: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
  resumePending?: boolean;
}): Promise<void> {
  const { runtimeContext, getRuntimeContext, signal, resumePending = false } = params;
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal)) return;
  await useWorkspaceComposerDraftStore.getState().hydrateOwnerDrafts(ownerKey);
  if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal)) return;
  const options = buildMessengerRequestOptions(runtimeContext, undefined, signal);
  let marker: string | null = null;
  const drafts: WorkspaceComposerDraft[] = [];

  do {
    const page = await getDraftsPage(options, {
      pageLimit: 100,
      pageMarker: marker ?? undefined,
      sortKey: "updated_at",
      sortDir: "desc",
    });
    if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal)) return;
    drafts.push(...page.items.map((item) => toComposerDraft(ownerKey, item)));
    marker = page.nextPageMarker;
  } while (marker != null);

  if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal)) return;
  useWorkspaceComposerDraftStore.getState().applyServerDrafts(ownerKey, drafts);
  if (
    !resumePending ||
    isWorkspaceRuntimeRequestInvalidated(runtimeContext, getRuntimeContext, signal)
  )
    return;
  resumeWorkspaceComposerDraftSync({ runtimeContext, getRuntimeContext });
}
