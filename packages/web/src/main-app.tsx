import React from "react";
import ReactDOM from "react-dom/client";
import { installAiContext } from "~/app/ai-context";
import { installDevTools } from "~/app/devtools";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { reportPresence } from "~/entities/user/api/user.api";
import {
  refreshWorkspaceApiBase,
  refreshZulipApiBase,
  setInstanceProvider,
} from "~/shared/api/client";
import { registerWorkspaceOrvalMutator } from "~/shared/api/workspace-orval-mutator";
import { initAnalytics } from "~/shared/lib/analytics/setup";
import { setStoreWiper, setAuthInstanceGetter } from "~/shared/lib/auth-guard";
import { initNetworkTracking } from "~/shared/lib/network";
import { perf } from "~/shared/lib/perf";
import { setPluginDataProvider } from "~/shared/lib/plugins/api";
import { initPlugins } from "~/shared/lib/plugins/setup";
import { initPresenceTracker, setPresenceReporter } from "~/shared/lib/presence";
import { initPush } from "~/shared/lib/push/push.service";
import { cleanupDevServiceWorkers, initPwaListeners } from "~/shared/lib/pwa";
import { initSentry } from "~/shared/lib/sentry";
import { initTouchTracking } from "~/shared/lib/touch";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import { initWebViewBridge } from "~/shared/lib/webview";
import { AppRoot } from "./app/app-root";
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
    email: inst.email,
    apiKey: inst.apiKey,
    authType: inst.authType ?? "api_key",
    workspaceOrgOrigin: inst.workspaceOrgOrigin,
  };
});

function syncApiBasesAfterInstanceChange(): void {
  refreshZulipApiBase();
  refreshWorkspaceApiBase();
}

useInstancesStore.subscribe((state, prev) => {
  if (state.currentInstanceId !== prev.currentInstanceId) {
    syncApiBasesAfterInstanceChange();
  }
});

setAuthInstanceGetter(() => {
  const inst = useInstancesStore.getState().getCurrentInstance();
  if (!inst) return null;
  return { email: inst.email, apiKey: inst.apiKey, realm: inst.realm };
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
        id: s.stream_id,
        name: s.name,
        badge: s.badge,
      })),
  getThemeMode: () => useThemeStore.getState().mode,
});

/** Application bootstrap after vendored Jitsi external_api is loaded (see `main.tsx`). */
export function mountApplication(): void {
  // ---------------------------------------------------------------------------
  // App initialization
  // ---------------------------------------------------------------------------

  syncApiBasesAfterInstanceChange();

  perf.mark("app:init");
  initSentry();
  initAnalytics();
  cleanupDevServiceWorkers();
  initPwaListeners();
  initNetworkTracking();
  initTouchTracking();
  initVisibilityTracking();
  setPresenceReporter((status) => {
    void reportPresence(status);
  });
  initPresenceTracker();
  initPush();
  initWebViewBridge();
  installAiContext();
  installDevTools();
  void initPlugins().catch(() => {});
  perf.reportWebVitals();

  ReactDOM.createRoot(document.getElementById("root")!).render(React.createElement(AppRoot));

  perf.mark("app:rendered");
  perf.measure("app:bootstrap", "app:init", "app:rendered");
}
