import { createStore, type StoreApi } from "zustand/vanilla";
import { detectImageMime, validateFileUpload } from "~/shared/lib/validation";
import type {
  WorkspaceComposerAttachment,
  WorkspaceComposerAttachmentScope,
  WorkspaceComposerAttachmentUploadContext,
  WorkspaceComposerAttachmentView,
  WorkspaceComposerAttachmentsState,
  WorkspaceComposerAttachmentTransport,
  WorkspaceComposerReadyAttachmentTransfer,
} from "./workspace-composer-attachments.types";

const MAX_CONCURRENT_UPLOADS = 5;
const MAGIC_BYTE_VALIDATED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

let fallbackLocalIdSequence = 0;

function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackLocalIdSequence += 1;
  return `workspace-composer-attachment-${fallbackLocalIdSequence}`;
}

function normalizeImageMime(mime: string): string {
  const normalized = mime.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function createPersistentImagePreviewUrl(file: File): string | null {
  if (!normalizeImageMime(file.type).startsWith("image/")) return null;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function revokePersistentImagePreviewUrl(previewUrl: string | null): void {
  if (previewUrl == null) return;
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(previewUrl);
}

function scopesEqual(
  left: WorkspaceComposerAttachmentScope,
  right: WorkspaceComposerAttachmentScope,
): boolean {
  return (
    left.ownerKey === right.ownerKey &&
    left.runtimeGeneration === right.runtimeGeneration &&
    left.scopeKey === right.scopeKey
  );
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "File upload failed";
}

const attachmentViewCache = new WeakMap<
  WorkspaceComposerAttachment,
  WorkspaceComposerAttachmentView
>();

async function validateAttachment(file: File): Promise<string | null> {
  const validation = validateFileUpload(file);
  if (!validation.valid) return validation.error ?? "File validation failed";

  const expectedMime = normalizeImageMime(file.type);
  if (!MAGIC_BYTE_VALIDATED_IMAGE_TYPES.has(expectedMime)) return null;
  const detectedMime = detectImageMime(await file.arrayBuffer());
  return detectedMime != null && normalizeImageMime(detectedMime) === expectedMime
    ? null
    : "Image file type is invalid";
}

function toAttachmentView(
  attachment: WorkspaceComposerAttachment,
): WorkspaceComposerAttachmentView {
  const cached = attachmentViewCache.get(attachment);
  if (cached != null) return cached;
  const view: WorkspaceComposerAttachmentView = {
    localId: attachment.localId,
    fileName: attachment.file.name,
    sizeBytes: attachment.file.size,
    contentType: attachment.file.type,
    previewUrl: attachment.previewUrl,
    status: attachment.status,
    serverMetadata: attachment.serverMetadata,
    error: attachment.error,
    errorKind: attachment.errorKind,
    loadedBytes: attachment.loadedBytes,
    totalBytes: attachment.totalBytes,
  };
  attachmentViewCache.set(attachment, view);
  return view;
}

export interface CreateWorkspaceComposerAttachmentsControllerOptions {
  scope: WorkspaceComposerAttachmentScope;
  transport: WorkspaceComposerAttachmentTransport;
  createLocalId?: () => string;
}

export interface WorkspaceComposerAttachmentsController {
  store: StoreApi<WorkspaceComposerAttachmentsState>;
  add: (files: readonly File[]) => string[];
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  updateTransport: (transport: WorkspaceComposerAttachmentTransport) => void;
  updateScope: (scope: WorkspaceComposerAttachmentScope) => void;
  discardAll: () => void;
  transferReady: <T>(
    consume: (attachments: readonly WorkspaceComposerReadyAttachmentTransfer[]) => T,
  ) => T | null;
  commitReady: <T>(
    consume: (attachments: readonly WorkspaceComposerReadyAttachmentTransfer[]) => Promise<T>,
  ) => Promise<T | null>;
  dispose: () => void;
}

export function selectWorkspaceComposerAttachmentViews(
  state: WorkspaceComposerAttachmentsState,
): WorkspaceComposerAttachmentView[] {
  return state.attachments.map(toAttachmentView);
}

export function selectWorkspaceComposerAttachmentViewById(
  localId: string,
): (state: WorkspaceComposerAttachmentsState) => WorkspaceComposerAttachmentView | null {
  return (state) => {
    const attachment = state.attachments.find((candidate) => candidate.localId === localId);
    return attachment == null ? null : toAttachmentView(attachment);
  };
}

export function selectWorkspaceComposerAttachmentsBlockSend(
  state: WorkspaceComposerAttachmentsState,
): boolean {
  return state.attachments.some((attachment) => attachment.status !== "ready");
}

export function selectWorkspaceComposerAttachmentsReady(
  state: WorkspaceComposerAttachmentsState,
): boolean {
  return (
    state.attachments.length > 0 &&
    state.attachments.every((attachment) => attachment.status === "ready")
  );
}

export function selectWorkspaceComposerAttachmentHasErrors(
  state: WorkspaceComposerAttachmentsState,
): boolean {
  return state.attachments.some((attachment) => attachment.status === "error");
}

export function createWorkspaceComposerAttachmentsController({
  scope: initialScope,
  transport,
  createLocalId: createAttachmentLocalId = createLocalId,
}: CreateWorkspaceComposerAttachmentsControllerOptions): WorkspaceComposerAttachmentsController {
  const store = createStore<WorkspaceComposerAttachmentsState>(() => ({ attachments: [] }));
  const uploadControllers = new Map<string, AbortController>();
  const deleteControllers = new Set<AbortController>();
  const activePreviewUrlsByLocalId = new Map<string, string>();
  const deleteTransportByLocalId = new Map<
    string,
    WorkspaceComposerAttachmentTransport["delete"]
  >();
  let currentTransport = transport;
  let scope = { ...initialScope };
  let attemptSequence = 0;
  let disposed = false;

  const revokeAttachmentPreview = (attachment: WorkspaceComposerAttachment): void => {
    if (attachment.previewUrl == null) return;
    if (activePreviewUrlsByLocalId.get(attachment.localId) !== attachment.previewUrl) return;
    activePreviewUrlsByLocalId.delete(attachment.localId);
    revokePersistentImagePreviewUrl(attachment.previewUrl);
  };

  const nextAttemptToken = (): number => {
    attemptSequence += 1;
    return attemptSequence;
  };

  const updateAttachment = (
    localId: string,
    update: (attachment: WorkspaceComposerAttachment) => WorkspaceComposerAttachment,
  ): WorkspaceComposerAttachment | null => {
    let updated: WorkspaceComposerAttachment | null = null;
    store.setState((state) => ({
      attachments: state.attachments.map((attachment) => {
        if (attachment.localId !== localId) return attachment;
        updated = update(attachment);
        return updated;
      }),
    }));
    return updated;
  };

  const isCurrentAttempt = (
    localId: string,
    attemptToken: number,
    requestScope: WorkspaceComposerAttachmentScope,
    expectedStatus: WorkspaceComposerAttachment["status"],
  ): boolean => {
    if (disposed || !scopesEqual(scope, requestScope)) return false;
    const attachment = store
      .getState()
      .attachments.find((candidate) => candidate.localId === localId);
    return (
      attachment?.status === expectedStatus &&
      attachment.attemptToken === attemptToken &&
      scopesEqual(attachment.scope, requestScope)
    );
  };

  const deleteBestEffort = (
    localId: string,
    requestScope: WorkspaceComposerAttachmentScope,
    serverMetadata: WorkspaceComposerReadyAttachmentTransfer["serverMetadata"],
    deleteAttachment: WorkspaceComposerAttachmentTransport["delete"],
  ): void => {
    const deleteController = new AbortController();
    deleteControllers.add(deleteController);
    void Promise.resolve()
      .then(() =>
        deleteAttachment(serverMetadata, {
          localId,
          scope: requestScope,
          signal: deleteController.signal,
        }),
      )
      .catch(() => undefined)
      .finally(() => deleteControllers.delete(deleteController));
  };

  const pumpQueue = (): void => {
    if (disposed) return;
    const state = store.getState();
    const uploadingCount = state.attachments.reduce(
      (count, attachment) => count + (attachment.status === "uploading" ? 1 : 0),
      0,
    );
    const availableSlots = MAX_CONCURRENT_UPLOADS - uploadingCount;
    if (availableSlots <= 0) return;
    const queued = state.attachments
      .filter((attachment) => attachment.status === "queued")
      .slice(0, availableSlots);
    for (const attachment of queued) startUpload(attachment.localId);
  };

  const startUpload = (localId: string): void => {
    const requestScope = { ...scope };
    const attemptToken = nextAttemptToken();
    const attachment = updateAttachment(localId, (current) => {
      if (current.status !== "queued" || !scopesEqual(current.scope, requestScope)) return current;
      return { ...current, status: "uploading", attemptToken, error: null, errorKind: null };
    });
    if (attachment?.status !== "uploading" || attachment.attemptToken !== attemptToken) return;

    const controller = new AbortController();
    uploadControllers.set(localId, controller);
    const requestTransport = currentTransport;
    const requestContext: WorkspaceComposerAttachmentUploadContext = {
      localId,
      scope: requestScope,
      signal: controller.signal,
      onProgress: (loadedBytes, totalBytes) => {
        if (!isCurrentAttempt(localId, attemptToken, requestScope, "uploading")) return;
        updateAttachment(localId, (current) => ({
          ...current,
          loadedBytes: Math.max(0, loadedBytes),
          totalBytes: totalBytes == null ? current.totalBytes : Math.max(0, totalBytes),
        }));
      },
    };
    void Promise.resolve()
      .then(() => requestTransport.upload(attachment.file, requestContext))
      .then((serverMetadata) => {
        if (!isCurrentAttempt(localId, attemptToken, requestScope, "uploading")) {
          deleteBestEffort(localId, requestScope, serverMetadata, requestTransport.delete);
          return;
        }
        deleteTransportByLocalId.set(localId, requestTransport.delete);
        updateAttachment(localId, (current) => ({
          ...current,
          status: "ready",
          serverMetadata,
          error: null,
          errorKind: null,
          loadedBytes: current.totalBytes ?? current.loadedBytes,
        }));
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          !isCurrentAttempt(localId, attemptToken, requestScope, "uploading")
        ) {
          return;
        }
        updateAttachment(localId, (current) => ({
          ...current,
          status: "error",
          serverMetadata: null,
          error: normalizeError(error),
          errorKind: "upload",
        }));
        deleteTransportByLocalId.delete(localId);
      })
      .finally(() => {
        if (uploadControllers.get(localId) === controller) uploadControllers.delete(localId);
        pumpQueue();
      });
  };

  const validateAndQueue = (localId: string, attemptToken: number): void => {
    const requestScope = { ...scope };
    const attachment = store
      .getState()
      .attachments.find((candidate) => candidate.localId === localId);
    if (attachment == null) return;

    void validateAttachment(attachment.file)
      .then((error) => {
        if (!isCurrentAttempt(localId, attemptToken, requestScope, "validating")) return;
        updateAttachment(localId, (current) =>
          error == null
            ? { ...current, status: "queued", error: null, errorKind: null }
            : {
                ...current,
                status: "error",
                serverMetadata: null,
                error,
                errorKind: "validation",
              },
        );
        pumpQueue();
      })
      .catch((error: unknown) => {
        if (!isCurrentAttempt(localId, attemptToken, requestScope, "validating")) return;
        updateAttachment(localId, (current) => ({
          ...current,
          status: "error",
          serverMetadata: null,
          error: normalizeError(error),
          errorKind: "validation",
        }));
        pumpQueue();
      });
  };

  const abortUploads = (): void => {
    for (const controller of uploadControllers.values()) controller.abort();
    uploadControllers.clear();
  };

  const discardAll = (): void => {
    const discarded = store.getState().attachments;
    abortUploads();
    store.setState({ attachments: [] });
    for (const attachment of discarded) {
      revokeAttachmentPreview(attachment);
      if (attachment.status === "ready" && attachment.serverMetadata != null) {
        deleteBestEffort(
          attachment.localId,
          attachment.scope,
          attachment.serverMetadata,
          deleteTransportByLocalId.get(attachment.localId) ?? currentTransport.delete,
        );
      }
      deleteTransportByLocalId.delete(attachment.localId);
    }
  };

  const controller: WorkspaceComposerAttachmentsController = {
    store,

    add(files) {
      if (disposed || files.length === 0) return [];
      const localIds: string[] = [];
      const additions = files.map((file) => {
        const localId = createAttachmentLocalId();
        const attemptToken = nextAttemptToken();
        const initialValidation = validateFileUpload(file);
        const previewUrl = createPersistentImagePreviewUrl(file);
        if (previewUrl != null) activePreviewUrlsByLocalId.set(localId, previewUrl);
        localIds.push(localId);
        return {
          localId,
          file,
          previewUrl,
          status: initialValidation.valid ? ("validating" as const) : ("error" as const),
          scope: { ...scope },
          attemptToken,
          serverMetadata: null,
          error: initialValidation.valid
            ? null
            : (initialValidation.error ?? "File validation failed"),
          errorKind: initialValidation.valid ? null : ("validation" as const),
          loadedBytes: 0,
          totalBytes: file.size,
        };
      });
      store.setState((state) => ({ attachments: [...state.attachments, ...additions] }));
      for (const attachment of additions) {
        if (attachment.status === "validating") {
          validateAndQueue(attachment.localId, attachment.attemptToken);
        }
      }
      return localIds;
    },

    retry(localId) {
      if (disposed) return;
      const attemptToken = nextAttemptToken();
      const attachment = updateAttachment(localId, (current) => {
        if (
          current.status !== "error" ||
          current.errorKind !== "upload" ||
          !scopesEqual(current.scope, scope)
        ) {
          return current;
        }
        const validation = validateFileUpload(current.file);
        if (!validation.valid) {
          return {
            ...current,
            attemptToken,
            error: validation.error ?? "File validation failed",
            errorKind: "validation",
          };
        }
        return {
          ...current,
          status: "validating",
          attemptToken,
          serverMetadata: null,
          error: null,
          errorKind: null,
          loadedBytes: 0,
        };
      });
      if (attachment?.status === "validating" && attachment.attemptToken === attemptToken) {
        deleteTransportByLocalId.delete(localId);
        validateAndQueue(localId, attemptToken);
      }
    },

    remove(localId) {
      if (disposed) return;
      const attachment = store
        .getState()
        .attachments.find((candidate) => candidate.localId === localId);
      if (attachment == null) return;
      uploadControllers.get(localId)?.abort();
      uploadControllers.delete(localId);
      store.setState((state) => ({
        attachments: state.attachments.filter((candidate) => candidate.localId !== localId),
      }));
      revokeAttachmentPreview(attachment);
      pumpQueue();
      if (attachment.status === "ready" && attachment.serverMetadata != null) {
        deleteBestEffort(
          localId,
          attachment.scope,
          attachment.serverMetadata,
          deleteTransportByLocalId.get(localId) ?? currentTransport.delete,
        );
      }
      deleteTransportByLocalId.delete(localId);
    },

    updateTransport(nextTransport) {
      currentTransport = nextTransport;
    },

    updateScope(nextScope) {
      if (disposed || scopesEqual(scope, nextScope)) return;
      discardAll();
      scope = { ...nextScope };
    },

    discardAll,

    transferReady<T>(
      consume: (attachments: readonly WorkspaceComposerReadyAttachmentTransfer[]) => T,
    ) {
      if (disposed) return null;
      const attachments = store.getState().attachments;
      if (attachments.length === 0) return null;
      const transfer: WorkspaceComposerReadyAttachmentTransfer[] = [];
      for (const attachment of attachments) {
        if (attachment.status !== "ready" || attachment.serverMetadata == null) return null;
        transfer.push({
          localId: attachment.localId,
          serverMetadata: attachment.serverMetadata,
        });
      }
      const result = consume(transfer);
      const transferredLocalIds = new Set(transfer.map((attachment) => attachment.localId));
      store.setState((state) => ({
        attachments: state.attachments.filter(
          (attachment) => !transferredLocalIds.has(attachment.localId),
        ),
      }));
      for (const attachment of attachments) {
        if (!transferredLocalIds.has(attachment.localId)) continue;
        revokeAttachmentPreview(attachment);
        deleteTransportByLocalId.delete(attachment.localId);
      }
      return result;
    },

    async commitReady<T>(
      consume: (attachments: readonly WorkspaceComposerReadyAttachmentTransfer[]) => Promise<T>,
    ) {
      if (disposed) return null;
      const attachments = store.getState().attachments;
      if (attachments.length === 0) return await consume([]);
      const transfer: WorkspaceComposerReadyAttachmentTransfer[] = [];
      for (const attachment of attachments) {
        if (attachment.status !== "ready" || attachment.serverMetadata == null) return null;
        transfer.push({
          localId: attachment.localId,
          serverMetadata: attachment.serverMetadata,
        });
      }
      const committedLocalIds = new Set(transfer.map((attachment) => attachment.localId));
      store.setState((state) => ({
        attachments: state.attachments.filter(
          (attachment) => !committedLocalIds.has(attachment.localId),
        ),
      }));
      try {
        const result = await consume(transfer);
        for (const attachment of attachments) {
          revokeAttachmentPreview(attachment);
          deleteTransportByLocalId.delete(attachment.localId);
        }
        return result;
      } catch (error) {
        if (!disposed) {
          store.setState((state) => ({ attachments: [...attachments, ...state.attachments] }));
        } else {
          for (const attachment of attachments) {
            if (attachment.serverMetadata != null) {
              deleteBestEffort(
                attachment.localId,
                attachment.scope,
                attachment.serverMetadata,
                deleteTransportByLocalId.get(attachment.localId) ?? currentTransport.delete,
              );
            }
            revokeAttachmentPreview(attachment);
            deleteTransportByLocalId.delete(attachment.localId);
          }
        }
        throw error;
      }
    },

    dispose() {
      if (disposed) return;
      discardAll();
      disposed = true;
    },
  };

  return controller;
}
