import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  createWorkspaceComposerAttachmentsController,
  selectWorkspaceComposerAttachmentHasErrors,
  selectWorkspaceComposerAttachmentViews,
  selectWorkspaceComposerAttachmentsBlockSend,
  selectWorkspaceComposerAttachmentsReady,
  type WorkspaceComposerAttachmentsController,
} from "./workspace-composer-attachments.model";
import type {
  WorkspaceComposerAttachmentScope,
  WorkspaceComposerAttachmentTransport,
  WorkspaceComposerAttachmentView,
  WorkspaceComposerReadyAttachmentTransfer,
} from "./workspace-composer-attachments.types";

export interface UseWorkspaceComposerAttachmentsOptions {
  scope: WorkspaceComposerAttachmentScope;
  transport: WorkspaceComposerAttachmentTransport;
}

export interface UseWorkspaceComposerAttachmentsResult {
  attachments: WorkspaceComposerAttachmentView[];
  attachmentsBlockSend: boolean;
  attachmentsReady: boolean;
  hasAttachmentErrors: boolean;
  add: (files: readonly File[]) => string[];
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  discardAll: () => void;
  transferReady: <T>(
    consume: (attachments: readonly WorkspaceComposerReadyAttachmentTransfer[]) => T,
  ) => T | null;
}

const pendingDisposals = new WeakMap<WorkspaceComposerAttachmentsController, object>();

function retainController(controller: WorkspaceComposerAttachmentsController): void {
  pendingDisposals.delete(controller);
}

function releaseController(controller: WorkspaceComposerAttachmentsController): void {
  const token = {};
  pendingDisposals.set(controller, token);
  queueMicrotask(() => {
    if (pendingDisposals.get(controller) !== token) return;
    pendingDisposals.delete(controller);
    controller.dispose();
  });
}

export function useWorkspaceComposerAttachments({
  scope,
  transport,
}: UseWorkspaceComposerAttachmentsOptions): UseWorkspaceComposerAttachmentsResult {
  const [initialTransport] = useState(() => transport);
  const controller = useMemo(
    () =>
      createWorkspaceComposerAttachmentsController({
        scope: {
          ownerKey: scope.ownerKey,
          runtimeGeneration: scope.runtimeGeneration,
          scopeKey: scope.scopeKey,
        },
        transport: initialTransport,
      }),
    [initialTransport, scope.ownerKey, scope.runtimeGeneration, scope.scopeKey],
  );

  useLayoutEffect(() => {
    controller.updateTransport(transport);
  }, [controller, transport]);

  useEffect(() => {
    retainController(controller);
    return () => releaseController(controller);
  }, [controller]);

  const attachments = useStore(
    controller.store,
    useShallow(selectWorkspaceComposerAttachmentViews),
  );
  const attachmentsBlockSend = useStore(
    controller.store,
    selectWorkspaceComposerAttachmentsBlockSend,
  );
  const attachmentsReady = useStore(controller.store, selectWorkspaceComposerAttachmentsReady);
  const hasAttachmentErrors = useStore(
    controller.store,
    selectWorkspaceComposerAttachmentHasErrors,
  );

  return useMemo(
    () => ({
      attachments,
      attachmentsBlockSend,
      attachmentsReady,
      hasAttachmentErrors,
      add: controller.add,
      retry: controller.retry,
      remove: controller.remove,
      discardAll: controller.discardAll,
      transferReady: controller.transferReady,
    }),
    [attachments, attachmentsBlockSend, attachmentsReady, controller, hasAttachmentErrors],
  );
}
