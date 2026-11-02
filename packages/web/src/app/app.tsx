import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  getCurrentWorkspaceSessionStorageScope,
  getWorkspaceSessionStorageScopeFromAuthState,
} from "~/entities/workspace-auth/workspace-session-storage-scope.lib";
import { useInstalledAppUpdateToast } from "~/features/app-update/app-update-installation.hook";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t, useTranslation } from "~/i18n/i18n";
import { usePageView } from "~/shared/lib/analytics/usePageView";
import { getElectronAPI } from "~/shared/lib/electron";
import { initFocusManagement, focusMainContent } from "~/shared/lib/focus";
import { useSwipe } from "~/shared/lib/gestures";
import {
  HotkeysProvider,
  useAppHotkey,
  useHotkeySettings,
  type HotkeyOverrides,
} from "~/shared/lib/hotkeys";
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
import { useAppUpdate } from "~/shared/lib/updater";
import { isWebView } from "~/shared/lib/webview";
import {
  isLegacyMessengerPathname,
  parseWorkspaceMessengerRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { parseWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";
import { configureWorkspaceI18nStorageScope } from "~/widgets/layout/layout-i18n-scope.lib";
import { resolveElectronTrayNavigation } from "./app-electron-navigation.lib";
import { AuthenticatedAppRoutes, LoginAppRoutes, WebViewAppRoutes } from "./app-route-definitions";
import { AppShortcutsHelpModal } from "./app-shortcuts-help-modal.ui";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";
import { resolveGlobalNavigationRoute } from "./app-shortcuts.lib";

configureWorkspaceI18nStorageScope();

const AppContent: React.FC = () => {
  const location = useLocation();
  const sessions = useWorkspaceAuthStore((s) => s.sessions);
  const currentAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const setCurrentAccountId = useWorkspaceAuthStore((s) => s.setCurrentAccountId);
  const navigate = useNavigate();
  const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory();
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
  useTranslation();
  const { overrides } = useHotkeySettings();
  const shortcutHelpSections = shortcutsHelpOpen ? buildShortcutHelpSections(overrides) : [];
  const { status: updateStatus, check: checkUpdates } = useAppUpdate();
  useInstalledAppUpdateToast();

  const navigateToMessenger = useCallback(() => {
    const instanceId = useWorkspaceAuthStore.getState().getCurrentSession()?.instanceId ?? null;
    void navigate(resolveGlobalNavigationRoute("navigation.messenger", instanceId));
  }, [navigate]);

  const navigateToCalendar = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("navigation.calendar"));
  }, [navigate]);

  const navigateToMail = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("navigation.mail"));
  }, [navigate]);

  const navigateToCalls = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("navigation.calls"));
  }, [navigate]);

  const navigateToActivity = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("navigation.activity"));
  }, [navigate]);

  const toggleThemeShortcut = useCallback(() => {
    useThemeStore.getState().toggleMode();
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
  useAppHotkey("navigation.back", goBack, { enabled: hasSessions && canGoBack });
  useAppHotkey("navigation.forward", goForward, { enabled: hasSessions && canGoForward });
  useAppHotkey("navigation.messenger", navigateToMessenger, { enabled: hasSessions });
  useAppHotkey("navigation.calendar", navigateToCalendar, { enabled: hasSessions });
  useAppHotkey("navigation.mail", navigateToMail, { enabled: hasSessions });
  useAppHotkey("navigation.calls", navigateToCalls, { enabled: hasSessions });
  useAppHotkey("navigation.activity", navigateToActivity, { enabled: hasSessions });
  useAppHotkey("interface.theme", toggleThemeShortcut, { enabled: hasSessions });
  useAppHotkey("interface.help", toggleShortcutsHelp, { enabled: hasSessions });

  useEffect(() => initMouseNavigation(goBack, goForward), [goBack, goForward]);

  useEffect(() => {
    if (!hasSessions || updateStatus !== "idle") return;
    checkUpdates();
  }, [hasSessions, updateStatus, checkUpdates]);

  useEffect(() => {
    if (!hasSessions || currentOrgRouteId == null) return;
    // The public share entry selects a session for its server before adding an org prefix.
    if (location.pathname === "/" && parseWorkspaceProfileShareHash(location.hash) != null) return;

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
        void navigate(resolveGlobalNavigationRoute("navigation.messenger", instanceId));
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

const App: React.FC = () => {
  const ownerKey = useWorkspaceAuthStore(
    (state) => getWorkspaceSessionStorageScopeFromAuthState(state).ownerKey,
  );
  const overrides = useSettingsStore((state) => state.hotkeyOverrides);
  const enabled = useSettingsStore((state) => state.hotkeysEnabled);
  const saveOverrides = useCallback(
    (value: HotkeyOverrides) => {
      if (getCurrentWorkspaceSessionStorageScope().ownerKey !== ownerKey) return false;
      return useSettingsStore.getState().setHotkeyOverrides(value);
    },
    [ownerKey],
  );
  const saveEnabled = useCallback(
    (value: boolean) => {
      if (getCurrentWorkspaceSessionStorageScope().ownerKey !== ownerKey) return false;
      return useSettingsStore.getState().setHotkeysEnabled(value);
    },
    [ownerKey],
  );
  return (
    <HotkeysProvider
      key={ownerKey ?? "anonymous"}
      overrides={overrides}
      enabled={enabled}
      onOverridesChange={saveOverrides}
      onEnabledChange={saveEnabled}
    >
      <AppContent />
    </HotkeysProvider>
  );
};

export default App;
