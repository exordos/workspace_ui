import { useEffect, useRef } from "react";
import { fetchUnreadMentions } from "~/entities/activity/activity-mentions.api";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("activity:unread-mentions-bootstrap");
const UNREAD_MENTIONS_BOOTSTRAP_RETRY_DELAYS_MS = [1_000, 3_000] as const;

export function useLayoutUnreadMentionsBootstrap(
  runtimeContext: WorkspaceRuntimeContext | null,
): void {
  const runtimeContextRef = useRef(runtimeContext);
  useEffect(() => {
    runtimeContextRef.current = runtimeContext;
  }, [runtimeContext]);
  const staleVersion = useActivityStore((state) => state.staleVersion);
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const runtimeGeneration = runtimeContext?.runtimeGeneration ?? null;
  const bootstrapScopeKey =
    ownerKey == null || runtimeGeneration == null
      ? null
      : `${ownerKey}\u0000${runtimeGeneration}\u0000${staleVersion}`;

  useEffect(() => {
    const currentRuntimeContext = runtimeContextRef.current;
    if (
      bootstrapScopeKey == null ||
      currentRuntimeContext == null ||
      ownerKey == null ||
      runtimeGeneration == null
    ) {
      useActivityStore.getState().setUnreadMentionsOwner(null);
      return;
    }

    const controller = new AbortController();
    const token = useActivityStore
      .getState()
      .startUnreadMentionsBootstrap(ownerKey, runtimeGeneration);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIndex = 0;

    const startBootstrap = async (): Promise<void> => {
      const attemptRuntimeContext = runtimeContextRef.current;
      if (
        attemptRuntimeContext == null ||
        controller.signal.aborted ||
        !isWorkspaceRuntimeRequestContextCurrent(
          attemptRuntimeContext,
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
        )
      ) {
        return;
      }

      try {
        const mentions = await fetchUnreadMentions({
          runtimeContext: attemptRuntimeContext,
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          !isWorkspaceRuntimeRequestContextCurrent(
            attemptRuntimeContext,
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
          )
        ) {
          return;
        }
        useActivityStore
          .getState()
          .finishUnreadMentionsBootstrap(ownerKey, runtimeGeneration, token, mentions);
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !isWorkspaceRuntimeRequestContextCurrent(
            attemptRuntimeContext,
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
          )
        ) {
          return;
        }

        const retryDelay = UNREAD_MENTIONS_BOOTSTRAP_RETRY_DELAYS_MS[retryIndex];
        if (retryDelay != null) {
          retryIndex += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void startBootstrap();
          }, retryDelay);
          return;
        }

        useActivityStore.getState().failUnreadMentionsBootstrap(ownerKey, runtimeGeneration, token);
        log.error("Failed to bootstrap unread mentions", { error: String(error) });
      }
    };

    void startBootstrap();

    return () => {
      controller.abort();
      if (retryTimer != null) {
        clearTimeout(retryTimer);
      }
    };
  }, [bootstrapScopeKey, ownerKey, runtimeGeneration]);
}
