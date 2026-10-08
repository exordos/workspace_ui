import { useEffect, useMemo } from "react";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import { getStreamBindingsPage as defaultGetStreamBindingsPage } from "~/shared/api/messenger-streams.api";
import type { WorkspaceMessengerStreamBindingDto } from "~/shared/api/messenger.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { adaptMessengerStreamBinding } from "./messenger-adapters.lib";
import { upsertMessengerStreamBindingsCache as defaultUpsertMessengerStreamBindingsCache } from "./messenger-cache.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { isMessengerStreamRemoved, useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerStreamBinding, MessengerUuid } from "./messenger.types";

export interface MessengerStreamBindingsClientDeps {
  getStreamBindingsPage?: (
    options: MessengerClientOptions,
    query: {
      streamUuid: MessengerUuid;
      pageLimit?: number;
      pageMarker?: string | number;
    },
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>;
}

export interface MessengerStreamBindingsCacheDeps {
  upsertStreamBindings?: (
    ownerKey: string,
    streamBindings: readonly MessengerStreamBinding[],
  ) => Promise<void> | void;
}

export interface MessengerStreamBindingsStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    | "ownerKey"
    | "bootstrapRequestVersion"
    | "streamBindingRevisionByStreamId"
    | "streamBindingsLoadedByStreamId"
    | "replaceStreamBindingsForStream"
  >;
}

export type MessengerStreamBindingsLoadResult =
  | {
      status: "loaded";
      ownerKey: string;
      streamUuid: MessengerUuid;
      bindings: number;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      streamUuid: MessengerUuid;
      reason: "missing-context" | "stale-owner" | "already-loaded";
    }
  | {
      status: "failed";
      ownerKey: string;
      streamUuid: MessengerUuid;
      error: string;
    };

export interface LoadMessengerStreamBindingsOptions {
  runtimeContext: WorkspaceRuntimeContext;
  streamUuid: MessengerUuid;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerStreamBindingsClientDeps;
  cache?: MessengerStreamBindingsCacheDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  // Внешний signal нужен для pre-start/stale проверки подписчика, но после старта
  // общий HTTP принадлежит loader-у: in-flight загрузка дедуплицируется.
  signal?: AbortSignal;
  store?: MessengerStreamBindingsStoreApi;
}

export interface UseMessengerStreamBindingsForRouteOptions {
  route: WorkspaceMessengerRouteMatch | null;
  enabled?: boolean;
}

interface MessengerStreamBindingsLoadEntry {
  promise: Promise<MessengerStreamBindingsLoadResult>;
  controller: AbortController;
}

const inflightStreamBindingLoads = new Map<string, MessengerStreamBindingsLoadEntry>();
const DEFAULT_STREAM_BINDINGS_PAGE_LIMIT = 100;
const MAX_STREAM_BINDINGS_SNAPSHOT_ATTEMPTS = 3;

function streamBindingsLoadKey(input: {
  ownerKey: string;
  runtimeGeneration: number;
  bootstrapRequestVersion: number;
  streamUuid: MessengerUuid;
}): string {
  return `${input.ownerKey}:generation:${input.runtimeGeneration}:bootstrap:${input.bootstrapRequestVersion}:stream:${input.streamUuid}`;
}

function normalizeStreamBindingsError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger stream bindings loading failed";
}

function writeStreamBindingsCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Cache failures must not block header data.
  }
}

function hasStreamBindingsLoaded(
  store: MessengerStreamBindingsStoreApi,
  ownerKey: string,
  streamUuid: MessengerUuid,
): boolean {
  const state = store.getState();
  if (state.ownerKey !== ownerKey) return false;
  return state.streamBindingsLoadedByStreamId[streamUuid] === true;
}

export function streamUuidFromWorkspaceMessengerRoute(
  route: WorkspaceMessengerRouteMatch | null,
): MessengerUuid | null {
  if (route?.kind === "stream" || route?.kind === "topic") {
    return route.streamUuid;
  }
  return null;
}

export function clearMessengerStreamBindingsLoadRegistry(): void {
  for (const entry of inflightStreamBindingLoads.values()) {
    entry.controller.abort();
  }
  inflightStreamBindingLoads.clear();
}

export async function loadMessengerStreamBindings({
  runtimeContext,
  streamUuid,
  getRuntimeContext = () => runtimeContext,
  client = {},
  cache = {},
  clientOptions,
  signal,
  store = useMessengerStore,
}: LoadMessengerStreamBindingsOptions): Promise<MessengerStreamBindingsLoadResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, streamUuid, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const bootstrapRequestVersion = store.getState().bootstrapRequestVersion;
  const loadKey = streamBindingsLoadKey({
    ownerKey,
    runtimeGeneration: requestContext.runtimeGeneration,
    bootstrapRequestVersion,
    streamUuid,
  });

  if (
    isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal) ||
    store.getState().ownerKey !== ownerKey ||
    isMessengerStreamRemoved(ownerKey, streamUuid)
  ) {
    return { status: "skipped", ownerKey, streamUuid, reason: "stale-owner" };
  }

  if (hasStreamBindingsLoaded(store, ownerKey, streamUuid)) {
    return { status: "skipped", ownerKey, streamUuid, reason: "already-loaded" };
  }

  const inflight = inflightStreamBindingLoads.get(loadKey);
  if (inflight != null) {
    return inflight.promise;
  }

  const controller = new AbortController();
  const isLoadCurrent = () => {
    const state = store.getState();
    return (
      !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, controller.signal) &&
      state.ownerKey === ownerKey &&
      state.bootstrapRequestVersion === bootstrapRequestVersion &&
      !isMessengerStreamRemoved(ownerKey, streamUuid)
    );
  };
  const skipped = (): MessengerStreamBindingsLoadResult => ({
    status: "skipped",
    ownerKey,
    streamUuid,
    reason: "stale-owner",
  });
  const load = (async (): Promise<MessengerStreamBindingsLoadResult> => {
    const requestOptions = buildMessengerRequestOptions(
      runtimeContext,
      clientOptions,
      controller.signal,
    );
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    requestOptions.fetchImpl = (request, init) =>
      isLoadCurrent() ? fetchImpl(request, init) : Promise.reject(new Error("stale-owner"));
    try {
      for (let attempt = 0; attempt < MAX_STREAM_BINDINGS_SNAPSHOT_ATTEMPTS; attempt++) {
        if (!isLoadCurrent()) return skipped();
        if (hasStreamBindingsLoaded(store, ownerKey, streamUuid))
          return { status: "skipped", ownerKey, streamUuid, reason: "already-loaded" };
        const revision = store.getState().streamBindingRevisionByStreamId[streamUuid] ?? 0;
        const bindingDtos: WorkspaceMessengerStreamBindingDto[] = [];
        const markers = new Set<string>();
        let pageMarker: string | number | undefined;
        let changed = false;
        do {
          const page = await (client.getStreamBindingsPage ?? defaultGetStreamBindingsPage)(
            requestOptions,
            { streamUuid, pageLimit: DEFAULT_STREAM_BINDINGS_PAGE_LIMIT, pageMarker },
          );
          if (!isLoadCurrent()) return skipped();
          if ((store.getState().streamBindingRevisionByStreamId[streamUuid] ?? 0) !== revision) {
            changed = true;
            break;
          }
          bindingDtos.push(...page.items);
          pageMarker = page.nextPageMarker ?? undefined;
          if (pageMarker != null) {
            const marker = String(pageMarker);
            if (markers.has(marker))
              throw new Error("Repeated messenger stream bindings page marker");
            markers.add(marker);
          }
        } while (pageMarker != null);
        // Restart the entire snapshot; pages captured before realtime changes cannot be merged safely.
        if (changed) continue;
        if (!isLoadCurrent()) return skipped();
        const bindings = bindingDtos
          .filter(
            (dto) => dto.stream_uuid === streamUuid && dto.project_id === requestContext.projectId,
          )
          .map(adaptMessengerStreamBinding);
        store.getState().replaceStreamBindingsForStream(ownerKey, streamUuid, bindings);
        if (!isLoadCurrent()) return skipped();
        // Replacement increments once; a synchronous listener can mutate permissions immediately after it.
        const committedRevision = revision + 1;
        writeStreamBindingsCacheBestEffort(() => {
          if (
            !isLoadCurrent() ||
            (store.getState().streamBindingRevisionByStreamId[streamUuid] ?? 0) !==
              committedRevision
          )
            return;
          return (cache.upsertStreamBindings ?? defaultUpsertMessengerStreamBindingsCache)(
            ownerKey,
            bindings,
          );
        });
        return { status: "loaded", ownerKey, streamUuid, bindings: bindings.length };
      }
      return {
        status: "failed",
        ownerKey,
        streamUuid,
        error: "Messenger stream bindings changed during loading",
      };
    } catch (error) {
      if (!isLoadCurrent()) return skipped();
      return { status: "failed", ownerKey, streamUuid, error: normalizeStreamBindingsError(error) };
    }
  })();

  const entry: MessengerStreamBindingsLoadEntry = { promise: load, controller };
  inflightStreamBindingLoads.set(loadKey, entry);
  try {
    return await load;
  } finally {
    if (inflightStreamBindingLoads.get(loadKey) === entry) {
      inflightStreamBindingLoads.delete(loadKey);
    }
  }
}

export function useMessengerStreamBindingsForRoute({
  route,
  enabled = true,
}: UseMessengerStreamBindingsForRouteOptions): void {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const streamUuid = streamUuidFromWorkspaceMessengerRoute(route);
  const messengerOwnerKey = useMessengerStore((state) => state.ownerKey);
  const messengerIsLoading = useMessengerStore((state) => state.isLoading);

  useEffect(() => {
    if (!enabled || runtimeContext == null || streamUuid == null) return;

    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    if (messengerOwnerKey !== ownerKey || messengerIsLoading) return;

    void loadMessengerStreamBindings({
      runtimeContext,
      streamUuid,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
    }).catch((error) => {
      reportUnexpectedError("workspace-messenger:stream-bindings", error);
    });
  }, [enabled, messengerIsLoading, messengerOwnerKey, runtimeContext, streamUuid]);
}
