import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWorkspaceDirectStream,
  type MessengerCreateStreamResult,
} from "~/entities/messenger/messenger-create-chat-actions.lib";
import {
  findWorkspaceDefaultTopic,
  findWorkspaceSelfChatStream,
  isWorkspaceSelfChat,
} from "~/entities/messenger/messenger-self-chat.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";

export type WorkspaceSelfChatViewState =
  | { status: "loading"; route: null; error: null; retry: () => void }
  | { status: "ready"; route: WorkspaceMessengerRouteMatch; error: null; retry: () => void }
  | { status: "error"; route: null; error: string; retry: () => void };

interface EnsureRequestState {
  requestKey: string;
  status: "failed";
  error: string | null;
}

interface WorkspaceSelfChatRouteScope {
  organizationId: string | null;
  projectId: string | null;
}

const ensureRequestsByRuntimeKey = new Map<string, Promise<MessengerCreateStreamResult>>();

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function runtimeRequestKey(runtimeContext: WorkspaceRuntimeContext): string {
  return `${workspaceRuntimeOwnerKey(runtimeContext)}:generation:${runtimeContext.runtimeGeneration}`;
}

function ensureWorkspaceSelfChat(
  runtimeContext: WorkspaceRuntimeContext,
): Promise<MessengerCreateStreamResult> {
  const requestKey = runtimeRequestKey(runtimeContext);
  const pending = ensureRequestsByRuntimeKey.get(requestKey);
  if (pending != null) return pending;

  const request = createWorkspaceDirectStream({
    runtimeContext,
    getRuntimeContext: currentRuntimeContext,
    directUserUuid: runtimeContext.userUuid,
    name: "Personal notes",
    description: "",
  });
  ensureRequestsByRuntimeKey.set(requestKey, request);
  const clearRequest = () => {
    if (ensureRequestsByRuntimeKey.get(requestKey) === request) {
      ensureRequestsByRuntimeKey.delete(requestKey);
    }
  };
  request.then(clearRequest, clearRequest).catch(() => undefined);
  return request;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Workspace self chat request failed";
}

export function useWorkspaceSelfChat({
  organizationId,
  projectId,
}: WorkspaceSelfChatRouteScope): WorkspaceSelfChatViewState {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const routeMatchesRuntime =
    runtimeContext == null
      ? false
      : runtimeContext.organizationId === organizationId && runtimeContext.projectId === projectId;
  const expectedOwnerKey =
    routeMatchesRuntime && runtimeContext != null ? workspaceRuntimeOwnerKey(runtimeContext) : null;
  const expectedRequestKey =
    routeMatchesRuntime && runtimeContext != null ? runtimeRequestKey(runtimeContext) : null;
  const storeOwnerKey = useMessengerStore((state) => state.ownerKey);
  const catalogLoading = useMessengerStore((state) => state.isLoading);
  const streamIds = useMessengerStore((state) => state.streamIds);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const topicIds = useMessengerStore((state) => state.topicIds);
  const topicsById = useMessengerStore((state) => state.topicsById);
  const [requestState, setRequestState] = useState<EnsureRequestState | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  const selfStream = useMemo(
    () =>
      expectedOwnerKey != null && storeOwnerKey === expectedOwnerKey
        ? findWorkspaceSelfChatStream({
            streamIds,
            streamsById,
            currentUserUuid: runtimeContext?.userUuid,
          })
        : null,
    [expectedOwnerKey, runtimeContext?.userUuid, storeOwnerKey, streamIds, streamsById],
  );
  const defaultTopic = useMemo(
    () =>
      selfStream == null
        ? null
        : findWorkspaceDefaultTopic({
            topicIds,
            topicsById,
            streamUuid: selfStream.uuid,
          }),
    [selfStream, topicIds, topicsById],
  );
  const retry = useCallback(() => {
    setRequestState(null);
    setRetryVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (
      runtimeContext == null ||
      expectedOwnerKey == null ||
      expectedRequestKey == null ||
      storeOwnerKey !== expectedOwnerKey ||
      catalogLoading ||
      (selfStream != null && defaultTopic != null) ||
      (requestState?.requestKey === expectedRequestKey && requestState.status === "failed")
    ) {
      return;
    }

    let disposed = false;
    ensureWorkspaceSelfChat(runtimeContext)
      .then((result) => {
        if (disposed) return;
        if (result.status === "skipped") {
          setRequestState({
            requestKey: expectedRequestKey,
            status: "failed",
            error: result.reason,
          });
          return;
        }
        if (!isWorkspaceSelfChat(result.stream, runtimeContext.userUuid)) {
          setRequestState({
            requestKey: expectedRequestKey,
            status: "failed",
            error: "Workspace self chat contract mismatch",
          });
          return;
        }
        setRequestState(null);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setRequestState({
          requestKey: expectedRequestKey,
          status: "failed",
          error: errorMessage(error),
        });
      });

    return () => {
      disposed = true;
    };
  }, [
    catalogLoading,
    defaultTopic,
    expectedOwnerKey,
    expectedRequestKey,
    requestState,
    retryVersion,
    runtimeContext,
    selfStream,
    storeOwnerKey,
  ]);

  if (organizationId == null || projectId == null) {
    return {
      status: "error",
      route: null,
      error: "Workspace favorites route is unavailable",
      retry,
    };
  }

  if (
    runtimeContext == null ||
    expectedOwnerKey == null ||
    expectedRequestKey == null ||
    storeOwnerKey !== expectedOwnerKey
  ) {
    return { status: "loading", route: null, error: null, retry };
  }

  if (selfStream != null && defaultTopic != null) {
    return {
      status: "ready",
      route: {
        kind: "topic",
        orgId: runtimeContext.organizationId,
        projectId: runtimeContext.projectId,
        streamUuid: selfStream.uuid,
        topicUuid: defaultTopic.uuid,
      },
      error: null,
      retry,
    };
  }

  if (requestState?.requestKey === expectedRequestKey && requestState.status === "failed") {
    return {
      status: "error",
      route: null,
      error: requestState.error ?? "Workspace self chat request failed",
      retry,
    };
  }

  return { status: "loading", route: null, error: null, retry };
}
