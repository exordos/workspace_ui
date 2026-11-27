import { useShallow } from "zustand/react/shallow";
import {
  resolveWorkspaceOwnerRuntimeForRequest,
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
  type WorkspaceRuntimeContextGetter,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { createLogger } from "~/shared/lib/logger";
import { loadWorkspaceComposerDrafts } from "./composer-draft-loader.lib";
import {
  deleteWorkspaceComposerDraftFromServer,
  protectWorkspaceComposerDraft,
  syncWorkspaceComposerDraft,
} from "./composer-draft-sync.lib";
import {
  createWorkspaceComposerDraftKey,
  EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT,
  hasWorkspaceComposerDraftSecret,
  isWorkspaceComposerDraftContentEmpty,
} from "./composer-draft.lib";
import {
  selectWorkspaceComposerDraft,
  useWorkspaceComposerDraftStore,
  type WorkspaceComposerDraftStoreState,
} from "./composer-draft.model";
import type {
  WorkspaceComposerDraft,
  WorkspaceComposerDraftContent,
  WorkspaceComposerDraftTarget,
} from "./composer-draft.types";

const editorLog = createLogger("workspace-composer-draft");

export interface WorkspaceComposerDraftActionContext {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
}

const EMPTY_DRAFT_LIST: readonly WorkspaceComposerDraft[] = [];

// Returns a stable list for the active owner whose drafts are shown by Activity.
export function useWorkspaceDraftList(ownerKey: string | null): readonly WorkspaceComposerDraft[] {
  return useWorkspaceComposerDraftStore(
    useShallow((state) =>
      ownerKey == null
        ? EMPTY_DRAFT_LIST
        : Object.values(state.draftsByKey)
            .filter((draft) => draft.ownerKey === ownerKey)
            .sort((left, right) => right.updatedAt - left.updatedAt),
    ),
  );
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

// Одно принятое намерение. Методы замыкают версию, которую видел отправитель.
export interface WorkspaceComposerDraftSubmission {
  clearPrivateOnAcceptance(): boolean; // Защищённый снимок переходит в очередь.
  beginNextDraftOnAcceptance(): boolean; // Освобождает редактор, сохраняя снимок до квитанции.
  completeOnReceipt(): void; // Квитанция сервера разрешает завершить обычный снимок.
  canCompleteComposer(): boolean; // Может ли UI применить результат после доставки.
}

interface WorkspaceComposerDraftSnapshot {
  content: WorkspaceComposerDraftContent; // Обычный или приватный снимок редактора.
  completedVisit: string | undefined; // Версия сброса для уже открытого редактора.
}

const emptyDraftSnapshot: WorkspaceComposerDraftSnapshot = {
  content: EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT,
  completedVisit: undefined,
};

// Снимок для редактора вне поддерживаемого разговора.
export function getEmptyWorkspaceComposerDraftSnapshot(): WorkspaceComposerDraftSnapshot {
  return emptyDraftSnapshot;
}

// Контракт черновика для одного разговора и поколения сессии.
export function createWorkspaceComposerDrafts(
  context: WorkspaceComposerDraftActionContext,
  conversationId: string,
) {
  const { runtimeContext, getRuntimeContext } = context;
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const scopeKey = createWorkspaceComposerDraftKey(ownerKey, conversationId);
  const isCurrent = () =>
    context.signal?.aborted !== true &&
    isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntimeContext);
  const store = useWorkspaceComposerDraftStore;
  const selected = (state: WorkspaceComposerDraftStoreState) =>
    selectWorkspaceComposerDraft(state, ownerKey, conversationId);
  const privateDraft = (state: WorkspaceComposerDraftStoreState) =>
    state.privateShadowsByConversationKey[scopeKey] ?? null;
  const read = (state: WorkspaceComposerDraftStoreState) =>
    privateDraft(state)?.content ??
    selected(state)?.content ??
    EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT;

  // Вторичная очистка не удаляет снимок, опубликованный синхронным подписчиком.
  function clearPrivate(snapshotId: symbol | undefined): boolean {
    const current = store.getState();
    if (!isCurrent() || privateDraft(current)?.snapshotId !== snapshotId) return false;
    if (snapshotId != null)
      current.setPrivateDraftShadow(
        ownerKey,
        conversationId,
        EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT,
      );
    return isCurrent() && privateDraft(store.getState()) == null;
  }

  // Deletion keeps the ETag and waits for an in-flight create or update.
  function queueDeletion(
    draft: WorkspaceComposerDraft,
    reason: "clear" | "sent",
    request: WorkspaceComposerDraftActionContext = context,
  ): void {
    if (!deleteWorkspaceComposerDraftFromServer({ ...request, draft })) {
      editorLog.warn("Draft deletion was rejected", {
        reason,
        draftUuid: draft.draftUuid,
        syncStatus: draft.syncStatus,
        disposition: draft.disposition,
      });
    }
    if (isCurrent()) store.getState().completeDraftVisit(ownerKey, conversationId, draft.draftUuid);
  }

  let snapshot = emptyDraftSnapshot;
  return {
    scopeKey,
    subscribe(listener: () => void): () => void {
      return store.subscribe(listener);
    },
    // React получает ту же ссылку, пока не изменились данные этого редактора.
    getSnapshot(): WorkspaceComposerDraftSnapshot {
      if (!isCurrent()) return emptyDraftSnapshot;
      const state = store.getState();
      const content = read(state);
      const completedVisit = state.completedConversationVisits[scopeKey];
      if (snapshot.content !== content || snapshot.completedVisit !== completedVisit)
        snapshot = { content, completedVisit };
      return snapshot;
    },
    // Гидратация каталога может завершиться после ухода. Выбор зависит от визита.
    hydrate(requestedDraftUuid: string | null, isVisitCurrent: () => boolean) {
      return store.getState().hydrateDraft(ownerKey, conversationId, requestedDraftUuid, {
        isRuntimeCurrent: isCurrent,
        isVisitCurrent,
      });
    },
    // Закрытие визита сохраняет отложенную локальную операцию.
    leave(): void {
      if (!isCurrent()) return;
      const current = selected(store.getState());
      if (current != null) void store.getState().flushDraft(ownerKey, current.draftUuid);
      store.getState().leaveConversation(ownerKey, conversationId);
    },
    // Политика защиты и синхронизации одна для текста, ответа и ручной очистки.
    update(
      updateContent: (
        content: WorkspaceComposerDraftContent,
      ) => WorkspaceComposerDraftContent | null,
      target?: WorkspaceComposerDraftTarget,
    ): boolean {
      if (!isCurrent()) return false;
      const state = store.getState();
      const current = selected(state);
      const privateSnapshotId = privateDraft(state)?.snapshotId;
      const content = updateContent(read(state));
      if (content == null || !isCurrent()) return false;

      if (hasWorkspaceComposerDraftSecret(content)) {
        state.setPrivateDraftShadow(ownerKey, conversationId, content);
        const latest = store.getState();
        if (
          isCurrent() &&
          current != null &&
          privateDraft(latest)?.content === content &&
          selected(latest)?.snapshotId === current.snapshotId
        ) {
          protectWorkspaceComposerDraft({ ...context, draft: current });
        }
        return true;
      }

      if (isWorkspaceComposerDraftContentEmpty(content)) {
        if (current != null) queueDeletion(current, "clear");
        clearPrivate(privateSnapshotId);
        return true;
      }

      const next = store.getState().setDraft(ownerKey, conversationId, content, target);
      if (next == null) return false;
      if (
        clearPrivate(privateSnapshotId) &&
        store.getState().draftsByKey[next.key]?.snapshotId === next.snapshotId
      )
        syncWorkspaceComposerDraft({ ...context, draft: next });
      return true;
    },
    // Черновик фиксируется до подготовки ключа, даже если его ещё нет.
    captureSubmission(): WorkspaceComposerDraftSubmission {
      const state = store.getState();
      const capturedPrivate = privateDraft(state)?.snapshotId;
      const draftAtSubmission = selected(state);
      const ownerAtSubmission = resolveWorkspaceOwnerRuntimeForRequest(runtimeContext);
      const readReceiptOwner: WorkspaceRuntimeContextGetter = () => {
        if (ownerAtSubmission == null) return isCurrent() ? runtimeContext : null;
        const owner = useWorkspaceAuthStore.getState().getRuntimeContextForOwner(ownerAtSubmission);
        return owner != null &&
          workspaceAuthSessionIncarnation(owner) ===
            workspaceAuthSessionIncarnation(ownerAtSubmission)
          ? owner
          : null;
      };
      const capturedDraft =
        draftAtSubmission == null
          ? null
          : { key: draftAtSubmission.key, snapshotId: draftAtSubmission.snapshotId };
      const selectedStillMatches = (current: WorkspaceComposerDraft | null) =>
        current?.key === capturedDraft?.key && current?.snapshotId === capturedDraft?.snapshotId;
      let completed = false;

      return {
        clearPrivateOnAcceptance(): boolean {
          return (
            selectedStillMatches(selected(store.getState())) &&
            clearPrivate(capturedPrivate) &&
            selectedStillMatches(selected(store.getState()))
          );
        },
        beginNextDraftOnAcceptance(): boolean {
          const state = store.getState();
          if (!isCurrent() || capturedPrivate != null || privateDraft(state) != null) return false;
          const editing = selected(state);
          if (capturedDraft == null || completed) return editing == null;
          if (editing == null || !selectedStillMatches(editing)) return false;
          state.completeDraftVisit(ownerKey, conversationId, editing.draftUuid, editing.snapshotId);
          if (isCurrent()) void store.getState().flushDraft(ownerKey, editing.draftUuid);
          const latest = store.getState();
          return isCurrent() && privateDraft(latest) == null && selected(latest) == null;
        },
        completeOnReceipt(): void {
          const ownerRuntime = readReceiptOwner();
          if (ownerRuntime == null || capturedPrivate != null) return;
          const current = store.getState();
          completed =
            isCurrent() && privateDraft(current) == null && selectedStillMatches(selected(current));
          if (capturedDraft == null) return;
          const sameRecord = current.draftsByKey[capturedDraft.key];
          if (
            sameRecord?.snapshotId === capturedDraft.snapshotId &&
            sameRecord.disposition === "editable"
          )
            queueDeletion(sameRecord, "sent", {
              runtimeContext: ownerRuntime,
              getRuntimeContext: readReceiptOwner,
            });
        },
        canCompleteComposer(): boolean {
          const current = store.getState();
          return (
            completed && isCurrent() && privateDraft(current) == null && selected(current) == null
          );
        },
      };
    },
  };
}
