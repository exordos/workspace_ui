import { useEffect, useRef } from "react";
import { captureActiveOrgRequestContext } from "~/entities/instance/instance.model";
import {
  getConnectionHealthSnapshot,
  requestReconnect,
  subscribeConnectionHealth,
  type ConnectionHealthPhase,
} from "~/shared/lib/connection-health";
import { onReconnect } from "~/shared/lib/network";
import { onTabResume, onVisibilityChange } from "~/shared/lib/visibility";
import {
  scheduleLayoutReconnectRefresh,
  type LayoutReconnectRefreshParams,
} from "./layout-reconnect-coordinator.lib";
import { isLayoutUserConnectionReady } from "./layout-user-connection-status.types";
import type { LayoutUserConnectionStatus } from "./layout-user-connection-status.types";

const VISIBILITY_RECOVERY_DEBOUNCE_MS = 500;

const RECOVERY_PHASES = new Set<ConnectionHealthPhase>(["offline", "degraded", "blocked"]);

function isLayoutConnectionRecovered(prevPhase: ConnectionHealthPhase): boolean {
  const snap = getConnectionHealthSnapshot();
  return RECOVERY_PHASES.has(prevPhase) && snap.phase === "ready" && snap.failureReason == null;
}

export interface UseLayoutConnectionRecoveryOptions {
  currentUserStatus: LayoutUserConnectionStatus;
  currentInstanceId: string | null;
  latestMessageIdRef?: { current: number | null };
  focusedMessageId?: number | null;
}

/** Triggers coalesced reconnect refresh on network restore or light refresh on tab resume. */
export function useLayoutConnectionRecovery(options: UseLayoutConnectionRecoveryOptions): void {
  const { currentUserStatus, currentInstanceId, latestMessageIdRef, focusedMessageId } = options;
  const statusRef = useRef(currentUserStatus);
  const hasBootstrapSettledRef = useRef(false);
  const refreshParamsRef = useRef<LayoutReconnectRefreshParams>({
    instanceId: currentInstanceId,
    latestMessageIdRef,
    focusedMessageId: focusedMessageId ?? null,
    orgContext: captureActiveOrgRequestContext(),
  });

  useEffect(() => {
    statusRef.current = currentUserStatus;
    refreshParamsRef.current = {
      instanceId: currentInstanceId,
      latestMessageIdRef,
      focusedMessageId: focusedMessageId ?? null,
      orgContext: captureActiveOrgRequestContext(),
    };
    if (isLayoutUserConnectionReady(currentUserStatus)) {
      hasBootstrapSettledRef.current = true;
    }
  }, [currentUserStatus, currentInstanceId, latestMessageIdRef, focusedMessageId]);

  useEffect(() => {
    const scheduleFull = () => {
      if (!hasBootstrapSettledRef.current) {
        return;
      }
      scheduleLayoutReconnectRefresh(refreshParamsRef.current, "full");
      if (statusRef.current === "degraded" || statusRef.current === "blocked") {
        requestReconnect({ showReconnecting: false });
      }
    };

    const scheduleLight = () => {
      if (!hasBootstrapSettledRef.current) {
        return;
      }
      scheduleLayoutReconnectRefresh(refreshParamsRef.current, "light");
      if (statusRef.current === "degraded" || statusRef.current === "blocked") {
        requestReconnect();
      }
    };

    const unsubResume = onTabResume(() => {
      scheduleLight();
    });

    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubVisibility = onVisibilityChange((visible) => {
      if (!visible) {
        if (visibilityTimer != null) {
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        }
        return;
      }
      if (visibilityTimer != null) {
        clearTimeout(visibilityTimer);
      }
      visibilityTimer = setTimeout(() => {
        visibilityTimer = null;
        scheduleLight();
      }, VISIBILITY_RECOVERY_DEBOUNCE_MS);
    });

    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFocus = () => {
      if (focusTimer != null) {
        clearTimeout(focusTimer);
      }
      focusTimer = setTimeout(() => {
        focusTimer = null;
        scheduleLight();
      }, VISIBILITY_RECOVERY_DEBOUNCE_MS);
    };
    window.addEventListener("focus", handleFocus);

    const unsubNetwork = onReconnect(() => {
      scheduleFull();
    });

    let prevPhase = getConnectionHealthSnapshot().phase;
    const unsubHealth = subscribeConnectionHealth(() => {
      const phase = getConnectionHealthSnapshot().phase;
      if (isLayoutConnectionRecovered(prevPhase)) {
        scheduleFull();
      }
      prevPhase = phase;
    });

    return () => {
      unsubResume();
      unsubVisibility();
      unsubNetwork();
      unsubHealth();
      window.removeEventListener("focus", handleFocus);
      if (visibilityTimer != null) clearTimeout(visibilityTimer);
      if (focusTimer != null) clearTimeout(focusTimer);
    };
  }, []);
}
