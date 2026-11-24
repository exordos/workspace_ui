import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceRealtimeSurface,
  WorkspaceRuntimeContext,
} from "~/entities/workspace-runtime/workspace-runtime.types";
import { getFolders, getStreams, getStreamTopics } from "~/shared/api/messenger-client";
import { invalidateWorkspaceOwnerFileResources } from "~/shared/lib/workspace-file-loader.lib";
import { deleteWorkspaceMessengerOwnerCache } from "~/shared/lib/workspace-messenger-cache-db";
import { adaptMessengerBootstrapPayload } from "../../model/chats/messenger-catalog-adapters.lib";
import {
  captureMessengerStreamRemovalCheck,
  getMessengerStoreForOwner,
  getSelectedMessengerStore,
  releaseMessengerStreamRemovalFences,
  restoreMessengerStream,
} from "../../model/chats/messenger.model";
import { loadWorkspaceComposerDrafts } from "../../model/drafts/composer-draft-loader.lib";
import { restoreWorkspaceComposerDraftsForStream } from "../../model/drafts/composer-draft.model";
import { loadMessengerLastMessagesForSidebar } from "../../model/messages/history/messenger-last-messages-loader.lib";
import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "../../model/messages/message.model";
import { clearMessengerReadBoundariesForOwner } from "../../model/messages/messenger-read-boundary.lib";
import {
  captureMessengerStreamCacheRemovalCheck,
  createMessengerCatalogCacheReconcileFence,
  readMessengerCatalogPayloadCache,
  releaseMessengerStreamCacheFences,
  restoreMessengerStreamCache,
  writeMessengerCatalogPayloadCache,
} from "../../model/messenger-cache.lib";
import { buildMessengerRequestOptions } from "../../model/messenger-request-options.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { bootstrapMessengerStore } from "./messenger-bootstrap.lib";
import type {
  BootstrapMessengerStoreOptions,
  MessengerBootstrapResult,
} from "./messenger-bootstrap.lib";
import type { MessengerStream } from "../../model/messenger.types";

// Each preparation is valid only for its owner, surface and runtime attempt.
export interface MessengerSessionCatalogOptions extends Pick<
  BootstrapMessengerStoreOptions,
  "client" | "cache" | "clientOptions" | "signal"
> {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  surface: WorkspaceRealtimeSurface;
}

function isSessionCatalogCurrent(options: MessengerSessionCatalogOptions): boolean {
  return !isWorkspaceRuntimeRequestInvalidated(
    options.runtimeContext,
    options.getRuntimeContext,
    options.signal,
  );
}

const completeCatalogStores = new WeakSet<ReturnType<typeof getSelectedMessengerStore>>();

// Discard transient projections and replay fences when one owner instance ends.
export function releaseMessengerSessionProjections(ownerKey: string): void {
  clearMessengerReadBoundariesForOwner(ownerKey);
  releaseMessengerStreamRemovalFences(ownerKey);
  releaseMessengerStreamCacheFences(ownerKey);
  useMessengerBackgroundProjectionStore.getState().clearOwner(ownerKey);
  invalidateWorkspaceOwnerFileResources(ownerKey);
}

function sessionModelStores(options: MessengerSessionCatalogOptions) {
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  const catalog =
    getMessengerStoreForOwner(ownerKey) ??
    (options.surface === "active" ? getSelectedMessengerStore() : null);
  const messages =
    getWorkspaceMessageStoreForOwner(ownerKey) ??
    (options.surface === "active" ? getSelectedWorkspaceMessageStore() : null);
  return { catalog, messages };
}

function prepareSessionModelOwners(options: MessengerSessionCatalogOptions) {
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  const { catalog, messages } = sessionModelStores(options);
  const currentCatalog = catalog?.getState();
  const currentMessages = messages?.getState();
  if (currentMessages?.ownerKey !== ownerKey) {
    currentMessages?.setOwner(
      ownerKey,
      currentMessages.ownerKey == null && currentCatalog?.ownerKey === ownerKey,
    );
  }
  if (currentCatalog?.ownerKey !== ownerKey) currentCatalog?.startBootstrap(ownerKey);
  return { catalog, messages };
}

// Make the selected owner available to route loaders before their passive effects.
export function prepareActiveMessengerSession(options: MessengerSessionCatalogOptions): void {
  if (options.surface !== "active" || !isSessionCatalogCurrent(options)) return;
  prepareSessionModelOwners(options);
}

function sessionCatalogError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Messenger bootstrap failed";
}

// Reset the active singleton when there is no selected runtime.
export function clearActiveMessengerSession(): void {
  getSelectedMessengerStore().getState().clear();
  getSelectedWorkspaceMessageStore().getState().setOwner(null, false);
}

// Report failures before catalog HTTP starts, such as a failure to read the epoch.
export function markMessengerSessionBootstrapError(
  options: MessengerSessionCatalogOptions,
  error: unknown,
): void {
  if (!isSessionCatalogCurrent(options)) return;
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  prepareSessionModelOwners(options)
    .catalog?.getState()
    .setBootstrapError(ownerKey, sessionCatalogError(error));
}

// Restore display state early. Only a complete snapshot serves as a catch-up baseline.
export async function restoreMessengerSessionCatalog(
  options: MessengerSessionCatalogOptions,
): Promise<"restored" | "missing" | "skipped"> {
  if (!isSessionCatalogCurrent(options)) return "skipped";
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  const { catalog, messages } = prepareSessionModelOwners(options);
  if (catalog != null && completeCatalogStores.has(catalog)) {
    const state = catalog.getState();
    if (state.lastLoadedAt != null && !state.isLoading && state.error == null) return "restored";
  }
  if (catalog != null) {
    // Drafts stay associated with the authorized owner when the screen changes.
    void loadWorkspaceComposerDrafts({ ...options, resumePending: true }).catch(() => undefined);
  }
  const version = catalog?.getState().bootstrapRequestVersion;
  const readCatalog =
    options.cache?.readMessengerCatalogPayloadCache ?? readMessengerCatalogPayloadCache;
  const cached = await readCatalog(ownerKey).catch(() => null);
  if (!isSessionCatalogCurrent(options)) return "skipped";
  if (cached == null) return "missing";
  if (catalog != null) {
    const state = catalog.getState();
    if (state.bootstrapRequestVersion !== version || state.ownerKey !== ownerKey) {
      return "skipped";
    }
    state.replaceBootstrapState(ownerKey, cached.payload);
    if (state.error != null) state.setBootstrapError(ownerKey, state.error);
    if (cached.epochVersion != null) state.setRealtimeCursor(ownerKey, cached.epochVersion);
    if (cached.hasCompleteCatalog === true) completeCatalogStores.add(catalog);
    void loadMessengerLastMessagesForSidebar({
      runtimeContext: options.runtimeContext,
      getRuntimeContext: () =>
        catalog.getState().bootstrapRequestVersion === version ? options.getRuntimeContext() : null,
      signal: options.signal,
      clientOptions: options.clientOptions,
      client: { getMessagesByUuids: options.client?.getMessagesByUuids },
      store: catalog,
      messageStore: messages ?? undefined,
    });
  }
  return cached.hasCompleteCatalog === true ? "restored" : "missing";
}

// Revoke protected file bytes as soon as the session learns of a journal gap.
export function invalidateMessengerSessionProtectedResources(
  options: MessengerSessionCatalogOptions,
): void {
  if (!isSessionCatalogCurrent(options)) return;
  invalidateWorkspaceOwnerFileResources(workspaceRuntimeOwnerKey(options.runtimeContext));
}

// Clearing a visible window can trigger its normal history loader. Purge old cache rows first.
function clearRecoveredMessengerProjections(
  options: MessengerSessionCatalogOptions,
  ownerKey: string,
): void {
  clearMessengerReadBoundariesForOwner(ownerKey);
  useMessengerBackgroundProjectionStore.getState().clearOwner(ownerKey);
  if (!isSessionCatalogCurrent(options)) return;
  const { catalog, messages } = sessionModelStores(options);
  if (catalog?.getState().ownerKey === ownerKey) {
    completeCatalogStores.delete(catalog);
    catalog.getState().clear({ preserveRemovedStreams: true });
  }
  if (messages?.getState().ownerKey === ownerKey)
    messages.getState().clear({ preserveRemovedStreams: true });
}

// An authoritative server response can restore membership whose create event was pruned.
function captureConfirmedStreams(
  ownerKey: string,
  messages: ReturnType<typeof getWorkspaceMessageStoreForOwner>,
): (streams: readonly MessengerStream[]) => void {
  const isDomainRemovalUnchanged = captureMessengerStreamRemovalCheck(ownerKey);
  const isCacheRemovalUnchanged = captureMessengerStreamCacheRemovalCheck(ownerKey);
  return (streams) => {
    for (const { uuid } of streams) {
      if (!isDomainRemovalUnchanged(uuid) || !isCacheRemovalUnchanged(uuid)) continue;
      restoreMessengerStream(ownerKey, uuid);
      restoreMessengerStreamCache(ownerKey, uuid);
      restoreWorkspaceComposerDraftsForStream(ownerKey, uuid);
      if (messages?.getState().ownerKey === ownerKey) {
        messages.getState().restoreMessagesForStream(uuid);
      }
    }
  };
}

// Load the mandatory chat, topic and folder snapshot into the owner's current projection.
export async function prepareMessengerSessionSnapshot(
  options: MessengerSessionCatalogOptions & { reset?: boolean },
): Promise<MessengerBootstrapResult> {
  const { runtimeContext, client, clientOptions, cache, signal, reset } = options;
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const skipped = { status: "skipped", ownerKey, reason: "stale-owner" } as const;
  const isWriteCurrent = () => isSessionCatalogCurrent(options);
  if (!isWriteCurrent()) return skipped;

  if (reset) {
    invalidateMessengerSessionProtectedResources(options);
    try {
      await deleteWorkspaceMessengerOwnerCache(ownerKey, {
        preserveDrafts: true,
        isWriteCurrent,
        requireWrite: true,
      });
    } catch (error) {
      if (!isWriteCurrent()) return skipped;
      markMessengerSessionBootstrapError(options, error);
      return { status: "failed", ownerKey, error: sessionCatalogError(error) };
    }
    if (!isWriteCurrent()) return skipped;
    clearRecoveredMessengerProjections(options, ownerKey);
    if (!isWriteCurrent()) return skipped;
  }

  const { catalog, messages } = prepareSessionModelOwners(options);
  const onStreamsConfirmed = reset ? captureConfirmedStreams(ownerKey, messages) : undefined;
  if (options.surface === "active") {
    const outcome = await bootstrapMessengerStore({
      ...options,
      store: catalog ?? undefined,
      messageStore: messages ?? undefined,
      requireCompleteSnapshot: true,
      restoreCache: false,
      loadDrafts: false,
      onStreamsConfirmed,
    });
    if (outcome.status === "applied" && catalog != null && isWriteCurrent())
      completeCatalogStores.add(catalog);
    return outcome;
  }

  const request = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const reconcileFence = createMessengerCatalogCacheReconcileFence();
  try {
    const [streams, topics, folders] = await Promise.all([
      (client?.getStreams ?? getStreams)(request),
      (client?.getTopics ?? getStreamTopics)(request),
      (client?.getFolders ?? getFolders)(request),
    ]);
    if (!isWriteCurrent()) return skipped;
    const payload = adaptMessengerBootstrapPayload({ streams, topics, folders });
    onStreamsConfirmed?.(payload.streams);
    await (cache?.writeMessengerCatalogPayloadCache ?? writeMessengerCatalogPayloadCache)(
      ownerKey,
      payload,
      {
        mode: "reconcile",
        reconcileFence,
        reconcileFolders: true,
        completeCatalog: true,
        isWriteCurrent,
        requireWrite: true,
      },
    );
    if (!isWriteCurrent()) return skipped;
    if (catalog != null) {
      catalog.getState().replaceBootstrapState(ownerKey, payload);
      completeCatalogStores.add(catalog);
      void loadMessengerLastMessagesForSidebar({
        runtimeContext,
        getRuntimeContext: options.getRuntimeContext,
        signal,
        clientOptions,
        client: { getMessagesByUuids: client?.getMessagesByUuids },
        store: catalog,
        messageStore: messages ?? undefined,
      });
    }
    return { status: "applied", ownerKey };
  } catch (error) {
    return isWriteCurrent()
      ? { status: "failed", ownerKey, error: sessionCatalogError(error) }
      : skipped;
  }
}
