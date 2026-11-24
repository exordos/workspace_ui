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
  restoreMessengerStream,
  useMessengerStore,
} from "../../model/chats/messenger.model";
import { loadWorkspaceComposerDrafts } from "../../model/drafts/composer-draft-loader.lib";
import { restoreWorkspaceComposerDraftsForStream } from "../../model/drafts/composer-draft.model";
import { loadMessengerLastMessagesForSidebar } from "../../model/messages/history/messenger-last-messages-loader.lib";
import { useWorkspaceMessageStore } from "../../model/messages/message.model";
import { clearMessengerReadBoundariesForOwner } from "../../model/messages/messenger-read-boundary.lib";
import {
  captureMessengerStreamCacheRemovalCheck,
  createMessengerCatalogCacheReconcileFence,
  readMessengerCatalogPayloadCache,
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

function assignActiveSessionOwner(ownerKey: string): void {
  const messages = useWorkspaceMessageStore.getState();
  const catalog = useMessengerStore.getState();
  messages.setOwner(ownerKey, messages.ownerKey == null && catalog.ownerKey === ownerKey);
  if (catalog.ownerKey !== ownerKey) catalog.startBootstrap(ownerKey);
}

// Make the selected owner available to route loaders before their passive effects.
export function prepareActiveMessengerSession(options: MessengerSessionCatalogOptions): void {
  if (options.surface !== "active" || !isSessionCatalogCurrent(options)) return;
  assignActiveSessionOwner(workspaceRuntimeOwnerKey(options.runtimeContext));
}

function sessionCatalogError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Messenger bootstrap failed";
}

// Reset the active singleton when there is no selected runtime.
export function clearActiveMessengerSession(): void {
  useMessengerStore.getState().clear();
  useWorkspaceMessageStore.getState().setOwner(null, false);
}

// Report failures before catalog HTTP starts, such as a failure to read the epoch.
export function markMessengerSessionBootstrapError(
  options: MessengerSessionCatalogOptions,
  error: unknown,
): void {
  if (options.surface !== "active" || !isSessionCatalogCurrent(options)) return;
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  assignActiveSessionOwner(ownerKey);
  useMessengerStore.getState().setBootstrapError(ownerKey, sessionCatalogError(error));
}

// Restore display state early. Only a complete snapshot serves as a catch-up baseline.
export async function restoreMessengerSessionCatalog(
  options: MessengerSessionCatalogOptions,
): Promise<"restored" | "missing" | "skipped"> {
  if (!isSessionCatalogCurrent(options)) return "skipped";
  const ownerKey = workspaceRuntimeOwnerKey(options.runtimeContext);
  const active = options.surface === "active";
  if (active) {
    assignActiveSessionOwner(ownerKey);
    // Drafts have their own sync and can restore even when catalogue or epoch reads fail.
    void loadWorkspaceComposerDrafts({ ...options, resumePending: true }).catch(() => undefined);
  }
  const version = useMessengerStore.getState().bootstrapRequestVersion;
  const readCatalog =
    options.cache?.readMessengerCatalogPayloadCache ?? readMessengerCatalogPayloadCache;
  const cached = await readCatalog(ownerKey).catch(() => null);
  if (!isSessionCatalogCurrent(options)) return "skipped";
  if (cached == null) return "missing";
  if (active) {
    const catalog = useMessengerStore.getState();
    if (catalog.bootstrapRequestVersion !== version || catalog.ownerKey !== ownerKey) {
      return "skipped";
    }
    catalog.replaceBootstrapState(ownerKey, cached.payload);
    if (catalog.error != null) catalog.setBootstrapError(ownerKey, catalog.error);
    if (cached.epochVersion != null) catalog.setRealtimeCursor(ownerKey, cached.epochVersion);
    void loadMessengerLastMessagesForSidebar({
      runtimeContext: options.runtimeContext,
      getRuntimeContext: () =>
        useMessengerStore.getState().bootstrapRequestVersion === version
          ? options.getRuntimeContext()
          : null,
      signal: options.signal,
      clientOptions: options.clientOptions,
      client: { getMessagesByUuids: options.client?.getMessagesByUuids },
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
  if (options.surface !== "active" || !isSessionCatalogCurrent(options)) return;
  const catalog = useMessengerStore.getState();
  if (catalog.ownerKey === ownerKey) catalog.clear({ preserveRemovedStreams: true });
  const messages = useWorkspaceMessageStore.getState();
  if (messages.ownerKey === ownerKey) messages.clear({ preserveRemovedStreams: true });
}

// An authoritative server response can restore membership whose create event was pruned.
function captureConfirmedStreams(
  ownerKey: string,
  active: boolean,
): (streams: readonly MessengerStream[]) => void {
  const isDomainRemovalUnchanged = captureMessengerStreamRemovalCheck(ownerKey);
  const isCacheRemovalUnchanged = captureMessengerStreamCacheRemovalCheck(ownerKey);
  return (streams) => {
    for (const { uuid } of streams) {
      if (!isDomainRemovalUnchanged(uuid) || !isCacheRemovalUnchanged(uuid)) continue;
      restoreMessengerStream(ownerKey, uuid);
      restoreMessengerStreamCache(ownerKey, uuid);
      restoreWorkspaceComposerDraftsForStream(ownerKey, uuid);
      if (active && useWorkspaceMessageStore.getState().ownerKey === ownerKey) {
        useWorkspaceMessageStore.getState().restoreMessagesForStream(uuid);
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

  const onStreamsConfirmed = reset
    ? captureConfirmedStreams(ownerKey, options.surface === "active")
    : undefined;
  if (options.surface === "active") {
    assignActiveSessionOwner(ownerKey);
    return bootstrapMessengerStore({
      ...options,
      requireCompleteSnapshot: true,
      restoreCache: false,
      loadDrafts: false,
      onStreamsConfirmed,
    });
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
    return isWriteCurrent() ? { status: "applied", ownerKey } : skipped;
  } catch (error) {
    return isWriteCurrent()
      ? { status: "failed", ownerKey, error: sessionCatalogError(error) }
      : skipped;
  }
}
