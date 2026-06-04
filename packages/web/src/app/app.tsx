import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { t } from "~/i18n/i18n";
import { DEFAULT_MESSENGER_STREAM_SLUG } from "~/shared/config/constants";
import { usePageView } from "~/shared/lib/analytics/usePageView";
import { getElectronAPI } from "~/shared/lib/electron";
import { initFocusManagement, focusMainContent } from "~/shared/lib/focus";
import { useSwipe } from "~/shared/lib/gestures";
import { useNavigationHistory, initMouseNavigation } from "~/shared/lib/navigation-history";
import {
  buildOrgRouteIdForZulipInstance,
  extractOrgRouteFromPathname,
  isOrgRoutePublicPath,
  replaceOrgRouteInPath,
  setCurrentOrgRouteIdResolver,
  withCurrentOrgRoute,
  withOrgRoutePrefix,
} from "~/shared/lib/org-route";
import { setPluginNavigate } from "~/shared/lib/plugins/api";
import { useShortcut } from "~/shared/lib/shortcuts";
import { useAppUpdate } from "~/shared/lib/updater";
import { isWebView } from "~/shared/lib/webview";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";
import { resolveElectronTrayNavigation } from "./app-electron-navigation.lib";
import { isForceUpdateRequiredStatus, shouldRedirectToForceUpdate } from "./app-force-update.lib";
import { AuthenticatedAppRoutes, LoginAppRoutes, WebViewAppRoutes } from "./app-route-definitions";
import { AppShortcutsHelpModal } from "./app-shortcuts-help-modal.ui";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";
import { resolveGlobalNavigationRoute, resolveGlobalShortcutAction } from "./app-shortcuts.lib";

const App: React.FC = () => {
  const location = useLocation();
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const navigate = useNavigate();
  const { goBack, goForward } = useNavigationHistory();
  const rootRef = useRef<HTMLDivElement>(null);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const hasInstances = instances.length > 0;
  const currentInstance = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId) ?? null,
    [instances, currentInstanceId],
  );
  const currentOrgRouteId = useMemo(
    () => (currentInstance ? buildOrgRouteIdForZulipInstance(currentInstance) : null),
    [currentInstance],
  );
  const defaultInboxRoute = useMemo(
    () => (currentOrgRouteId ? withOrgRoutePrefix("/inbox", currentOrgRouteId) : "/inbox"),
    [currentOrgRouteId],
  );
  const forceUpdateRoute = useMemo(
    () =>
      currentOrgRouteId ? withOrgRoutePrefix("/force-update", currentOrgRouteId) : "/force-update",
    [currentOrgRouteId],
  );
  const shortcutHelpSections = useMemo(() => buildShortcutHelpSections(), []);
  const { status: updateStatus, check: checkUpdates } = useAppUpdate();
  const forceUpdateEnabled = !import.meta.env.DEV;
  const isForceUpdateRequired = useMemo(
    () => isForceUpdateRequiredStatus(updateStatus),
    [updateStatus],
  );

  const navigateToMessenger = useCallback(() => {
    const instanceId = useInstancesStore.getState().currentInstanceId;
    void navigate(resolveGlobalNavigationRoute("mod+1", DEFAULT_MESSENGER_STREAM_SLUG, instanceId));
  }, [navigate]);

  const navigateToCalendar = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+2", DEFAULT_MESSENGER_STREAM_SLUG));
  }, [navigate]);

  const navigateToMail = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+3", DEFAULT_MESSENGER_STREAM_SLUG));
  }, [navigate]);

  const navigateToCalls = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+4", DEFAULT_MESSENGER_STREAM_SLUG));
  }, [navigate]);

  const navigateToActivity = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+shift+a", DEFAULT_MESSENGER_STREAM_SLUG));
  }, [navigate]);

  const toggleThemeShortcut = useCallback(() => {
    const action = resolveGlobalShortcutAction("mod+shift+t", DEFAULT_MESSENGER_STREAM_SLUG);
    if (action.type === "toggle-theme") {
      useThemeStore.getState().toggleMode();
    }
  }, []);
  const toggleShortcutsHelp = useCallback(() => {
    setShortcutsHelpOpen((open) => !open);
  }, []);
  const closeShortcutsHelp = useCallback(() => {
    setShortcutsHelpOpen(false);
  }, []);

  useEffect(() => {
    setPluginNavigate((path) => {
      void navigate(withCurrentOrgRoute(path));
    });
  }, [navigate]);

  useEffect(() => {
    setCurrentOrgRouteIdResolver(() => {
      const current = useInstancesStore.getState().getCurrentInstance();
      return current ? buildOrgRouteIdForZulipInstance(current) : null;
    });

    return () => {
      setCurrentOrgRouteIdResolver(null);
    };
  }, []);
  useEffect(() => initFocusManagement(), []);
  usePageView();
  useShortcut("alt+arrowleft", goBack, { context: "global" });
  useShortcut("alt+arrowright", goForward, { context: "global" });
  useShortcut("mod+1", navigateToMessenger, { context: "global", enabled: hasInstances });
  useShortcut("mod+2", navigateToCalendar, { context: "global", enabled: hasInstances });
  useShortcut("mod+3", navigateToMail, { context: "global", enabled: hasInstances });
  useShortcut("mod+4", navigateToCalls, { context: "global", enabled: hasInstances });
  useShortcut("mod+shift+a", navigateToActivity, { context: "global", enabled: hasInstances });
  useShortcut("mod+shift+t", toggleThemeShortcut, { context: "global", enabled: hasInstances });
  useShortcut("mod+/", toggleShortcutsHelp, { context: "global", enabled: hasInstances });
  useShortcut("escape", closeShortcutsHelp, { context: "modal", enabled: shortcutsHelpOpen });

  useEffect(() => initMouseNavigation(goBack, goForward), [goBack, goForward]);

  useEffect(() => {
    if (!hasInstances || updateStatus !== "idle") return;
    checkUpdates();
  }, [hasInstances, updateStatus, checkUpdates]);

  useEffect(() => {
    if (!hasInstances || currentOrgRouteId == null) return;

    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    const { orgId } = extractOrgRouteFromPathname(location.pathname);

    if (orgId == null) {
      if (isOrgRoutePublicPath(location.pathname)) return;
      const canonicalPath = withOrgRoutePrefix(fullPath, currentOrgRouteId);
      if (canonicalPath !== fullPath) {
        void navigate(canonicalPath, { replace: true });
      }
      return;
    }

    const matchedInstance = instances.find(
      (instance) => buildOrgRouteIdForZulipInstance(instance) === orgId,
    );
    if (matchedInstance == null) {
      const fallbackPath = replaceOrgRouteInPath(fullPath, currentOrgRouteId);
      if (fallbackPath !== fullPath) {
        void navigate(fallbackPath, { replace: true });
      }
      return;
    }

    if (matchedInstance.id !== currentInstanceId) {
      setCurrentInstanceId(matchedInstance.id);
    }
  }, [
    hasInstances,
    currentOrgRouteId,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    instances,
    currentInstanceId,
    setCurrentInstanceId,
  ]);

  useEffect(() => {
    if (
      !shouldRedirectToForceUpdate({
        hasInstances,
        isForceUpdateRequired,
        pathname: location.pathname,
        forceUpdateEnabled,
      })
    ) {
      return;
    }
    void navigate(forceUpdateRoute, { replace: true });
  }, [
    forceUpdateEnabled,
    hasInstances,
    isForceUpdateRequired,
    location.pathname,
    navigate,
    forceUpdateRoute,
  ]);

  useEffect(() => {
    const unsubscribe = getElectronAPI()?.deeplink.onNavigate((route) => {
      const target = resolveElectronTrayNavigation(route);
      if (!target) return;
      if (target.type === "open-messenger") {
        const instanceId = useInstancesStore.getState().currentInstanceId;
        void navigate(
          resolveGlobalNavigationRoute("mod+1", DEFAULT_MESSENGER_STREAM_SLUG, instanceId),
        );
        return;
      }
      void navigate(withCurrentOrgRoute(target.route));
    });

    return () => unsubscribe?.();
  }, [navigate]);

  useSwipe(
    rootRef,
    {
      onSwipeRight: goBack,
      onSwipeLeft: goForward,
    },
    { edgeOnly: true, edgeWidth: 24, threshold: 60 },
  );

  if (isWebView()) {
    return <WebViewAppRoutes />;
  }

  if (instances.length === 0) {
    return (
      <div ref={rootRef} className="h-full">
        <ErrorBoundary fallback={(api) => <PageErrorFallback onRetry={api.resetErrorBoundary} />}>
          <Suspense fallback={<PageLoader />}>
            <LoginAppRoutes />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="h-full">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          focusMainContent();
        }}
      >
        {t("a11y.skipToContent")}
      </a>
      {shortcutsHelpOpen && (
        <AppShortcutsHelpModal sections={shortcutHelpSections} onClose={closeShortcutsHelp} />
      )}
      <ErrorBoundary fallback={(api) => <PageErrorFallback onRetry={api.resetErrorBoundary} />}>
        <Suspense fallback={<PageLoader />}>
          <AuthenticatedAppRoutes defaultInboxRoute={defaultInboxRoute} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default App;
