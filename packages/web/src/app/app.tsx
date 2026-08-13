import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { DEFAULT_MESSENGER_STREAM_SLUG } from "~/shared/config/constants";
import { usePageView } from "~/shared/lib/analytics/usePageView";
import { getElectronAPI } from "~/shared/lib/electron";
import { initFocusManagement, focusMainContent } from "~/shared/lib/focus";
import { useSwipe } from "~/shared/lib/gestures";
import { useNavigationHistory, initMouseNavigation } from "~/shared/lib/navigation-history";
import {
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
import {
  isLegacyMessengerPathname,
  parseWorkspaceMessengerRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";
import { configureWorkspaceI18nStorageScope } from "~/widgets/layout/layout-i18n-scope.lib";
import { resolveElectronTrayNavigation } from "./app-electron-navigation.lib";
import { AuthenticatedAppRoutes, LoginAppRoutes, WebViewAppRoutes } from "./app-route-definitions";
import { AppShortcutsHelpModal } from "./app-shortcuts-help-modal.ui";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";
import { resolveGlobalNavigationRoute, resolveGlobalShortcutAction } from "./app-shortcuts.lib";

configureWorkspaceI18nStorageScope();

const App: React.FC = () => {
  const location = useLocation();
  const sessions = useWorkspaceAuthStore((s) => s.sessions);
  const currentAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const setCurrentAccountId = useWorkspaceAuthStore((s) => s.setCurrentAccountId);
  const navigate = useNavigate();
  const { goBack, goForward } = useNavigationHistory();
  const rootRef = useRef<HTMLDivElement>(null);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const hasSessions = sessions.length > 0;
  const currentSession = useMemo(
    () => sessions.find((session) => session.accountId === currentAccountId) ?? null,
    [sessions, currentAccountId],
  );
  const currentOrgRouteId = currentSession?.organizationId ?? null;
  const defaultMessengerRoute = useMemo(
    () =>
      currentSession != null
        ? workspaceMessengerRootRoute(currentSession.organizationId, currentSession.projectId)
        : "/",
    [currentSession],
  );
  const shortcutHelpSections = useMemo(() => buildShortcutHelpSections(), []);
  const { status: updateStatus, check: checkUpdates } = useAppUpdate();

  const navigateToMessenger = useCallback(() => {
    const instanceId = useWorkspaceAuthStore.getState().getCurrentSession()?.instanceId ?? null;
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
      if (isLegacyMessengerPathname(path)) return;
      void navigate(withCurrentOrgRoute(path));
    });
  }, [navigate]);

  useEffect(() => {
    setCurrentOrgRouteIdResolver(() => {
      return useWorkspaceAuthStore.getState().getCurrentSession()?.organizationId ?? null;
    });

    return () => {
      setCurrentOrgRouteIdResolver(null);
    };
  }, []);
  useEffect(() => initFocusManagement(), []);
  usePageView();
  useShortcut("alt+arrowleft", goBack, { context: "global" });
  useShortcut("alt+arrowright", goForward, { context: "global" });
  useShortcut("mod+1", navigateToMessenger, { context: "global", enabled: hasSessions });
  useShortcut("mod+2", navigateToCalendar, { context: "global", enabled: hasSessions });
  useShortcut("mod+3", navigateToMail, { context: "global", enabled: hasSessions });
  useShortcut("mod+4", navigateToCalls, { context: "global", enabled: hasSessions });
  useShortcut("mod+shift+a", navigateToActivity, { context: "global", enabled: hasSessions });
  useShortcut("mod+shift+t", toggleThemeShortcut, { context: "global", enabled: hasSessions });
  useShortcut("mod+/", toggleShortcutsHelp, { context: "global", enabled: hasSessions });
  useShortcut("escape", closeShortcutsHelp, { context: "modal", enabled: shortcutsHelpOpen });

  useEffect(() => initMouseNavigation(goBack, goForward), [goBack, goForward]);

  useEffect(() => {
    if (!hasSessions || updateStatus !== "idle") return;
    checkUpdates();
  }, [hasSessions, updateStatus, checkUpdates]);

  useEffect(() => {
    if (!hasSessions || currentOrgRouteId == null) return;

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

    const workspaceRoute = parseWorkspaceMessengerRoute(location.pathname);
    const currentSessionMatchesRoute =
      currentSession?.organizationId === orgId &&
      (workspaceRoute == null || currentSession.projectId === workspaceRoute.projectId);
    if (currentSessionMatchesRoute) {
      return;
    }

    const matchedSession =
      sessions.find(
        (session) =>
          session.organizationId === orgId &&
          (workspaceRoute == null || session.projectId === workspaceRoute.projectId),
      ) ?? sessions.find((session) => session.organizationId === orgId);
    if (matchedSession == null) {
      const fallbackPath = replaceOrgRouteInPath(fullPath, currentOrgRouteId);
      if (fallbackPath !== fullPath) {
        void navigate(fallbackPath, { replace: true });
      }
      return;
    }

    if (matchedSession.accountId !== currentAccountId) {
      setCurrentAccountId(matchedSession.accountId);
    }
    if (workspaceRoute != null && matchedSession.projectId !== workspaceRoute.projectId) {
      void navigate(
        workspaceMessengerRootRoute(matchedSession.organizationId, matchedSession.projectId),
        { replace: true },
      );
    }
  }, [
    hasSessions,
    currentOrgRouteId,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    sessions,
    currentSession,
    currentAccountId,
    setCurrentAccountId,
  ]);

  useEffect(() => {
    const unsubscribe = getElectronAPI()?.deeplink.onNavigate((route) => {
      const target = resolveElectronTrayNavigation(route);
      if (!target) return;
      if (target.type === "open-messenger") {
        const instanceId = useWorkspaceAuthStore.getState().getCurrentSession()?.instanceId ?? null;
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

  if (sessions.length === 0) {
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
          <AuthenticatedAppRoutes defaultMessengerRoute={defaultMessengerRoute} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default App;
