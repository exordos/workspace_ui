import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useLocation, useNavigate, Navigate, useParams } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { t } from "~/i18n/i18n";
import { usePageView } from "~/shared/lib/analytics/usePageView";
import { getElectronAPI } from "~/shared/lib/electron";
import { initFocusManagement, focusMainContent } from "~/shared/lib/focus";
import { useSwipe } from "~/shared/lib/gestures";
import { useNavigationHistory, initMouseNavigation } from "~/shared/lib/navigation-history";
import {
  buildOrgRouteIdFromRealm,
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
import { Layout } from "~/widgets/layout/layout.ui";
import { normalizeElectronDeeplinkRoute } from "./app-deeplink.lib";
import { isForceUpdateRequiredStatus, shouldRedirectToForceUpdate } from "./app-force-update.lib";
import { buildShortcutHelpSections } from "./app-shortcuts-help.lib";
import { resolveGlobalNavigationRoute, resolveGlobalShortcutAction } from "./app-shortcuts.lib";
import { WebViewShell } from "./webview-shell";

const LoginPage = React.lazy(() =>
  import("~/pages/login/login-page.ui").then((m) => ({ default: m.LoginPage })),
);
const PasteTokenPage = React.lazy(() =>
  import("~/pages/login/paste-token-page.ui").then((m) => ({ default: m.PasteTokenPage })),
);
const ChatPage = React.lazy(() => import("~/pages/chat/chat-page.ui").then((m) => ({ default: m.ChatPage })));
const ActivityPage = React.lazy(() =>
  import("~/pages/activity/activity-page.ui").then((m) => ({ default: m.ActivityPage })),
);
const CalendarPage = React.lazy(() =>
  import("~/pages/calendar/calendar-page.ui").then((m) => ({ default: m.CalendarPage })),
);
const MailPage = React.lazy(() => import("~/pages/mail/mail-page.ui").then((m) => ({ default: m.MailPage })));
const CallsPage = React.lazy(() => import("~/pages/calls/calls-page.ui").then((m) => ({ default: m.CallsPage })));
const LogsPage = React.lazy(() => import("~/pages/logs/logs-page.ui").then((m) => ({ default: m.LogsPage })));
const ServicesPage = React.lazy(() =>
  import("~/pages/services/services-page.ui").then((m) => ({ default: m.ServicesPage })),
);
const LicensesPage = React.lazy(() =>
  import("~/pages/licenses/licenses-page.ui").then((m) => ({ default: m.LicensesPage })),
);
const InboxPage = React.lazy(() => import("~/pages/inbox/inbox-page.ui").then((m) => ({ default: m.InboxPage })));
const FeedPage = React.lazy(() => import("~/pages/feed/feed-page.ui").then((m) => ({ default: m.FeedPage })));
const UpdatePage = React.lazy(() =>
  import("~/pages/update/update-page.ui").then((m) => ({ default: m.UpdatePage })),
);
const MessageRedirectPage = React.lazy(() =>
  import("~/pages/message-redirect/message-redirect-page.ui").then((m) => ({ default: m.MessageRedirectPage })),
);

const DEFAULT_STREAM = "general";

const OrgInboxRedirect: React.FC = () => {
  const { orgId } = useParams<{ orgId?: string }>();
  if (orgId == null || orgId.length === 0) {
    return <Navigate to="/inbox" replace />;
  }
  return <Navigate to={withOrgRoutePrefix("/inbox", orgId)} replace />;
};

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
    () => (currentInstance ? buildOrgRouteIdFromRealm(currentInstance.realm) : null),
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
    void navigate(resolveGlobalNavigationRoute("mod+1", DEFAULT_STREAM));
  }, [navigate]);

  const navigateToCalendar = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+2", DEFAULT_STREAM));
  }, [navigate]);

  const navigateToMail = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+3", DEFAULT_STREAM));
  }, [navigate]);

  const navigateToCalls = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+4", DEFAULT_STREAM));
  }, [navigate]);

  const navigateToActivity = useCallback(() => {
    void navigate(resolveGlobalNavigationRoute("mod+shift+a", DEFAULT_STREAM));
  }, [navigate]);

  const toggleThemeShortcut = useCallback(() => {
    const action = resolveGlobalShortcutAction("mod+shift+t", DEFAULT_STREAM);
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
      return current ? buildOrgRouteIdFromRealm(current.realm) : null;
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
      (instance) => buildOrgRouteIdFromRealm(instance.realm) === orgId,
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
      const normalizedRoute = normalizeElectronDeeplinkRoute(route);
      if (!normalizedRoute) return;
      void navigate(withCurrentOrgRoute(normalizedRoute));
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
    return (
      <Routes>
        <Route path="/webview/*" element={<WebViewShell />} />
        <Route path="/*" element={<WebViewShell />} />
      </Routes>
    );
  }

  if (instances.length === 0) {
    return (
      <div ref={rootRef} className="h-full">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/paste-token" element={<PasteTokenPage />} />
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </Suspense>
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
        <div
          className="bg-bg/80 fixed inset-0 z-modal flex items-center justify-center p-4"
          data-shortcut-context="modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("shortcuts.title")}
        >
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">{t("shortcuts.title")}</h2>
              <button
                type="button"
                onClick={closeShortcutsHelp}
                className="rounded px-2 py-1 text-sm text-text-muted hover:bg-bg hover:text-text-primary"
                aria-label={t("common.close")}
              >
                {t("common.close")}
              </button>
            </div>
            <div className="grid gap-4 overflow-y-auto p-4 md:grid-cols-2">
              {shortcutHelpSections.map((section) => (
                <section key={section.category} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {section.category}
                  </h3>
                  <div className="space-y-1.5">
                    {section.entries.map((entry) => (
                      <div
                        key={`${section.category}-${entry.label}-${entry.combo}`}
                        className="flex items-center justify-between gap-2 rounded bg-bg px-2 py-1.5 text-xs text-text-primary"
                      >
                        <span className="truncate">{entry.label}</span>
                        <kbd className="rounded border border-border-subtle bg-card-bg px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                          {entry.combo}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      <ErrorBoundary fallback={<PageErrorFallback />}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/paste-token" element={<PasteTokenPage />} />
            <Route path="/" element={<Navigate to={defaultInboxRoute} replace />} />
            <Route path="/org/:orgId" element={<OrgInboxRedirect />} />
            <Route path="/force-update" element={<UpdatePage forceMode />} />
            <Route path="/org/:orgId/force-update" element={<UpdatePage forceMode />} />
            <Route path="/licenses" element={<LicensesPage />} />
            <Route path="/org/:orgId/licenses" element={<LicensesPage />} />
            <Route element={<Layout />}>
              <Route path="/stream/:streamSlug" element={<ChatPage key={location.pathname} />} />
              <Route
                path="/stream/:streamSlug/topic/:topicName"
                element={<ChatPage key={location.pathname} />}
              />
              <Route path="/dm/:dmId" element={<ChatPage key={location.pathname} />} />
              <Route path="/message/:messageId" element={<MessageRedirectPage />} />
              <Route path="/activity/:filter" element={<ActivityPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/mail" element={<MailPage />} />
              <Route path="/call" element={<CallsPage />} />
              <Route path="/calls" element={<CallsPage />} />
              <Route
                path="/settings/personal-info"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/settings/logs" element={<LogsPage />} />
              <Route path="/settings/build" element={<UpdatePage />} />
              <Route
                path="/settings/*"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/all-services" element={<ServicesPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/updates" element={<UpdatePage />} />
            </Route>
            <Route path="/org/:orgId" element={<Layout />}>
              <Route path="stream/:streamSlug" element={<ChatPage key={location.pathname} />} />
              <Route
                path="stream/:streamSlug/topic/:topicName"
                element={<ChatPage key={location.pathname} />}
              />
              <Route path="dm/:dmId" element={<ChatPage key={location.pathname} />} />
              <Route path="message/:messageId" element={<MessageRedirectPage />} />
              <Route path="activity/:filter" element={<ActivityPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="mail" element={<MailPage />} />
              <Route path="call" element={<CallsPage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route
                path="settings/personal-info"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="settings/logs" element={<LogsPage />} />
              <Route path="settings/build" element={<UpdatePage />} />
              <Route
                path="settings/*"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="logs" element={<LogsPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="all-services" element={<ServicesPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="updates" element={<UpdatePage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default App;
