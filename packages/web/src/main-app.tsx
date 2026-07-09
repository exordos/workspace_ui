import React from "react";
import ReactDOM from "react-dom/client";
import { installAiContext } from "~/app/ai-context";
import { installDevTools } from "~/app/devtools";
import { createWorkspacePluginDataProvider } from "~/app/workspace-plugin-data-provider.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { initAnalytics } from "~/shared/lib/analytics/setup";
import { setStoreWiper } from "~/shared/lib/auth-guard";
import { brand } from "~/shared/lib/brand";
import { initConnectionHealth } from "~/shared/lib/connection-health";
import { createLogger } from "~/shared/lib/logger";
import { initNetworkTracking } from "~/shared/lib/network";
import { attachNotificationAudioUnlock } from "~/shared/lib/notification-sound";
import { perf } from "~/shared/lib/perf";
import { setPluginDataProvider } from "~/shared/lib/plugins/api";
import { initPlugins } from "~/shared/lib/plugins/setup";
import { initPresenceTracker } from "~/shared/lib/presence";
import { cleanupDevServiceWorkers, initPwaListeners, getRuntime } from "~/shared/lib/pwa";
import { initSentry } from "~/shared/lib/sentry";
import { initTouchTracking } from "~/shared/lib/touch";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import { initWebViewBridge } from "~/shared/lib/webview";
import { AppRoot } from "./app/app-root";
import "./app/app.styles.css";
import "./app/focus-outline.styles.css";

setStoreWiper(() => {
  useMessengerStore.getState().clear();
});

setPluginDataProvider(createWorkspacePluginDataProvider());

/** Application bootstrap after vendored Jitsi external_api is loaded (see `main.tsx`). */
export function mountApplication(): void {
  // ---------------------------------------------------------------------------
  // App initialization
  // ---------------------------------------------------------------------------

  perf.mark("app:init");
  initSentry();
  initAnalytics();
  cleanupDevServiceWorkers();
  initPwaListeners();
  initNetworkTracking();
  initConnectionHealth();
  initTouchTracking();
  initVisibilityTracking();
  initPresenceTracker();
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
  });

  ReactDOM.createRoot(document.getElementById("root")!).render(React.createElement(AppRoot));

  perf.mark("app:rendered");
  perf.measure("app:bootstrap", "app:init", "app:rendered");
}
