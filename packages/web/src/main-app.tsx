import React from "react";
import ReactDOM from "react-dom/client";
import { installAiContext } from "~/app/ai-context";
import {
  migratePersistedIamSessionsToCurrentProject,
  type PersistedIamSessionScopeState,
} from "~/app/app-iam-project-scope-migration.lib";
import { installDevTools } from "~/app/devtools";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { reportPresence } from "~/entities/user/api/user.api";
import {
  refreshWorkspaceApiBase,
  refreshMessengerApiBase,
  setInstanceProvider,
} from "~/shared/api/client";
import {
  refreshStoredIamAccessToken,
  setIamTokenUpdater,
} from "~/shared/api/iam-refresh-session.lib";
import { clearInFlightWorkspaceFolderRequests } from "~/shared/api/workspace-client";
import { registerWorkspaceOrvalMutator } from "~/shared/api/workspace-orval-mutator";
import { initAnalytics } from "~/shared/lib/analytics/setup";
import { setStoreWiper, setAuthInstanceGetter } from "~/shared/lib/auth-guard";
import { brand } from "~/shared/lib/brand";
import { initConnectionHealth } from "~/shared/lib/connection-health";
import { resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { createLogger } from "~/shared/lib/logger";
import { initNetworkTracking } from "~/shared/lib/network";
import { attachNotificationAudioUnlock } from "~/shared/lib/notification-sound";
import { perf } from "~/shared/lib/perf";
import { setPluginDataProvider } from "~/shared/lib/plugins/api";
import { initPlugins } from "~/shared/lib/plugins/setup";
import { initPresenceTracker, setPresenceReporter } from "~/shared/lib/presence";
import { initPush } from "~/shared/lib/push/push.service";
import { cleanupDevServiceWorkers, initPwaListeners, getRuntime } from "~/shared/lib/pwa";
import { initSentry } from "~/shared/lib/sentry";
import { initTouchTracking } from "~/shared/lib/touch";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import { initWebViewBridge } from "~/shared/lib/webview";
import { PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";
import { AppRoot } from "./app/app-root";
import type { Root } from "react-dom/client";
import "./app/app.styles.css";
import "./app/focus-outline.styles.css";

// ---------------------------------------------------------------------------
// FSD provider wiring (shared layer cannot import entities; we inject here)
// ---------------------------------------------------------------------------

registerWorkspaceOrvalMutator();

setInstanceProvider(() => {
  const inst = useInstancesStore.getState().getCurrentInstance();
  if (!inst) return null;
  return {
    id: inst.id,
    realm: inst.realm,
    login: inst.login,
    authType: "iam",
    iamAccessToken: inst.iamAccessToken,
    iamRefreshToken: inst.iamRefreshToken,
    workspaceOrgOrigin: inst.workspaceOrgOrigin,
  };
});

setIamTokenUpdater(({ instanceId, accessToken, refreshToken }) => {
  useInstancesStore.getState().updateInstanceIamTokens(instanceId, {
    accessToken,
    ...(refreshToken != null && refreshToken.length > 0 ? { refreshToken } : {}),
  });
});

function syncApiBasesAfterInstanceChange(): void {
  refreshMessengerApiBase();
  refreshWorkspaceApiBase();
}

useInstancesStore.subscribe((state, prev) => {
  if (state.currentInstanceId !== prev.currentInstanceId) {
    syncApiBasesAfterInstanceChange();
    clearInFlightWorkspaceFolderRequests();
  }
});

setAuthInstanceGetter(() => {
  const inst = useInstancesStore.getState().getCurrentInstance();
  if (!inst) return null;
  return {
    login: inst.login,
    realm: inst.realm,
    authType: "iam",
    iamAccessToken: inst.iamAccessToken,
    iamRefreshToken: inst.iamRefreshToken,
  };
});

setStoreWiper(() => {
  const store = useInstancesStore.getState();
  const current = store.getCurrentInstance();
  if (current) {
    store.removeInstance(current.id);
  }
  useChatListStore.getState().clear();
});

setPluginDataProvider({
  getCurrentUserId: () => useChatListStore.getState().currentUserId ?? null,
  getStreams: () =>
    useChatListStore
      .getState()
      .streams()
      .map((s) => ({
        id: s.streamUuid,
        name: s.name,
        badge: s.badge,
      })),
  getThemeMode: () => useThemeStore.getState().mode,
});

let applicationRuntimeInitialized = false;

function initializeApplicationRuntime(): void {
  if (applicationRuntimeInitialized) return;
  applicationRuntimeInitialized = true;
  syncApiBasesAfterInstanceChange();

  perf.mark("app:init");
  initSentry();
  initAnalytics();
  cleanupDevServiceWorkers();
  initPwaListeners();
  initNetworkTracking();
  initConnectionHealth();
  initTouchTracking();
  initVisibilityTracking();
  setPresenceReporter((status) => {
    void reportPresence(status);
  });
  initPresenceTracker();
  initPush();
  attachNotificationAudioUnlock();
  initWebViewBridge();
  installAiContext();
  installDevTools();
  void initPlugins().catch((err) => {
    reportUnexpectedError("plugins", err, { phase: "init" });
  });
  perf.reportWebVitals();

  createLogger("app").info("Application started", {
    runtime: getRuntime(),
    version: import.meta.env.VITE_APP_VERSION ?? "unknown",
    brand: brand.appName,
    instanceCount: useInstancesStore.getState().instances.length,
  });
}

async function refreshPersistedInstanceProjectScope(
  instance: PersistedIamSessionScopeState,
): Promise<boolean> {
  const stored = useInstancesStore
    .getState()
    .instances.find((candidate) => candidate.id === instance.id);
  if (stored == null) return true;
  const refreshToken = stored.iamRefreshToken?.trim() ?? "";
  const iamOrigin = resolveIamApiOrigin(stored);
  if (refreshToken.length === 0 || iamOrigin.length === 0) return false;
  const refreshed = await refreshStoredIamAccessToken({
    iamOrigin,
    refreshToken,
    instanceId: stored.id,
  });
  return refreshed != null;
}

async function bootstrapApplication(root: Root): Promise<void> {
  root.render(React.createElement(PageLoader));
  const store = useInstancesStore.getState();
  const migration = await migratePersistedIamSessionsToCurrentProject({
    instances: store.instances,
    refreshInstance: refreshPersistedInstanceProjectScope,
    removeInstance: (instanceId) => useInstancesStore.getState().removeInstance(instanceId),
  });
  if (migration.failedInstanceIds.length > 0) {
    createLogger("app").warn("Persisted IAM project-scope migration failed", {
      failedSessionCount: migration.failedInstanceIds.length,
    });
    root.render(
      React.createElement(PageErrorFallback, {
        onRetry: () => {
          void bootstrapApplication(root);
        },
      }),
    );
    return;
  }

  initializeApplicationRuntime();
  root.render(React.createElement(AppRoot));
  perf.mark("app:rendered");
  perf.measure("app:bootstrap", "app:init", "app:rendered");
}

/** Application bootstrap after vendored Jitsi external_api is loaded (see `main.tsx`). */
export function mountApplication(): void {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  void bootstrapApplication(root);
}
