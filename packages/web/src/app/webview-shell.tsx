/**
 * WebView Shell — minimal app shell for pages loaded in native WebView.
 *
 * No sidebar, no top bar, no folder rail — just the page content.
 * Used when native iOS/Android app opens a web page in WKWebView/WebView.
 *
 * Route: /webview/* mirrors the main app routes but without the Layout wrapper.
 * Auth is injected from the native side via the bridge.
 */
import React, { Suspense, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from "react-router-dom";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { selectMode, selectPalette } from "~/features/theme-picker/theme-picker.model";
import { setLocale } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import {
  getNativeBridge,
  onNativeMessage,
  onAuthFromNative,
  type NativeMessage,
} from "~/shared/lib/webview";
import {
  isLegacyMessengerPathname,
  workspaceInboxRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";

const ActivityPage = React.lazy(() =>
  import("~/pages/activity/activity-page.ui").then((m) => ({ default: m.ActivityPage })),
);
const CalendarPage = React.lazy(() =>
  import("~/pages/calendar/calendar-page.ui").then((m) => ({ default: m.CalendarPage })),
);
const MailPage = React.lazy(() =>
  import("~/pages/mail/mail-page.ui").then((m) => ({ default: m.MailPage })),
);
const CallsPage = React.lazy(() =>
  import("~/pages/calls/calls-page.ui").then((m) => ({ default: m.CallsPage })),
);
const LogsPage = React.lazy(() =>
  import("~/pages/logs/logs-page.ui").then((m) => ({ default: m.LogsPage })),
);
const ServicesPage = React.lazy(() =>
  import("~/pages/services/services-page.ui").then((m) => ({ default: m.ServicesPage })),
);
const LicensesPage = React.lazy(() =>
  import("~/pages/licenses/licenses-page.ui").then((m) => ({ default: m.LicensesPage })),
);
const InboxPage = React.lazy(() =>
  import("~/pages/inbox/inbox-page.ui").then((m) => ({ default: m.InboxPage })),
);
const FeedPage = React.lazy(() =>
  import("~/pages/feed/feed-page.ui").then((m) => ({ default: m.FeedPage })),
);
const LoginPage = React.lazy(() =>
  import("~/pages/login/login-page.ui").then((m) => ({ default: m.LoginPage })),
);
const ChatPage = React.lazy(() =>
  import("~/pages/chat/chat-page.ui").then((m) => ({ default: m.ChatPage })),
);

function resolveWebviewWorkspaceMessengerRoot(params: {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
  orgId?: string;
}): string {
  const currentSession =
    params.sessions.find((session) => session.accountId === params.currentAccountId) ?? null;
  const routeSession =
    params.orgId != null
      ? (params.sessions.find((session) => session.organizationId === params.orgId) ??
        currentSession)
      : currentSession;

  if (routeSession == null) {
    return "/login";
  }

  return workspaceMessengerRootRoute(routeSession.organizationId, routeSession.projectId);
}

const WebviewWorkspaceMessengerRootRedirect: React.FC = () => {
  const { orgId } = useParams<{ orgId?: string }>();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const target = resolveWebviewWorkspaceMessengerRoot({ sessions, currentAccountId, orgId });
  return <Navigate to={target} replace />;
};

const WebviewWorkspaceMessengerDefaultRedirect: React.FC = () => {
  const { orgId, projectId } = useParams<{ orgId?: string; projectId?: string }>();
  if (orgId == null || orgId.length === 0 || projectId == null || projectId.length === 0) {
    return <WebviewWorkspaceMessengerRootRedirect />;
  }
  return <Navigate to={workspaceInboxRoute(orgId, projectId)} replace />;
};

export const WebViewShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const diagnosticsRouteElement = IS_CONNECTION_DIAGNOSTICS_ENABLED ? (
    <LogsPage />
  ) : (
    <WebviewWorkspaceMessengerRootRedirect />
  );

  useEffect(() => {
    return onAuthFromNative(() => {});
  }, []);

  useEffect(() => {
    const bridge = getNativeBridge();
    const title = document.title;
    if (title) bridge.setTitle(title);
  }, [location.pathname]);

  useEffect(() => {
    return onNativeMessage((msg: NativeMessage) => {
      if (msg.type === "navigate") {
        const cleaned = msg.path.replace(/^\/webview/, "");
        // Only allow internal app paths — reject absolute URLs, protocol handlers,
        // and any path that doesn't start with "/" (prevents javascript:, data:, etc.)
        if (
          cleaned.startsWith("/") &&
          !cleaned.startsWith("//") &&
          !isLegacyMessengerPathname(cleaned)
        ) {
          void navigate(withCurrentOrgRoute(cleaned));
        }
      }
      if (msg.type === "back") {
        void navigate(-1);
      }
      if (msg.type === "theme") {
        const mode = msg.mode ?? msg.theme;
        if (mode) selectMode(mode);
        if (msg.paletteId) selectPalette(msg.paletteId);
      }
      if (msg.type === "locale") {
        if (msg.locale === "ru" || msg.locale === "en") {
          setLocale(msg.locale);
          useSettingsStore.getState().setLanguage(msg.locale);
        }
      }
      if (msg.type === "logout") {
        wipeCredentials();
        void navigate("/login");
      }
    });
  }, [navigate]);

  return (
    <div className="safe-area-all flex h-screen flex-col bg-bg text-text-primary">
      <ErrorBoundary fallback={(api) => <PageErrorFallback onRetry={api.resetErrorBoundary} />}>
        <Suspense fallback={<PageLoader />}>
          <main className="touch-scroll flex-1 overflow-auto">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<WebviewWorkspaceMessengerRootRedirect />} />
              <Route path="/org/:orgId" element={<WebviewWorkspaceMessengerRootRedirect />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/mail" element={<MailPage />} />
              <Route path="/call" element={<CallsPage />} />
              <Route path="/calls" element={<CallsPage />} />
              <Route path="/settings/logs" element={diagnosticsRouteElement} />
              <Route path="/settings/*" element={<WebviewWorkspaceMessengerRootRedirect />} />
              <Route path="/logs" element={diagnosticsRouteElement} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/all-services" element={<ServicesPage />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route
                path="/org/:orgId/project/:projectId/messenger"
                element={<WebviewWorkspaceMessengerDefaultRedirect />}
              />
              <Route path="/org/:orgId/project/:projectId/inbox" element={<InboxPage />} />
              <Route
                path="/org/:orgId/project/:projectId/activity/:filter"
                element={<ActivityPage key={location.pathname} />}
              />
              <Route path="/org/:orgId/project/:projectId/feed" element={<FeedPage />} />
              <Route
                path="/org/:orgId/project/:projectId/stream/:streamUuid"
                element={<ChatPage key={location.pathname} />}
              />
              <Route
                path="/org/:orgId/project/:projectId/stream/:streamUuid/topic/:topicUuid"
                element={<ChatPage key={location.pathname} />}
              />
              <Route
                path="/org/:orgId/project/:projectId/message/:messageUuid"
                element={<ChatPage key={location.pathname} />}
              />
              <Route path="/org/:orgId/calendar" element={<CalendarPage />} />
              <Route path="/org/:orgId/mail" element={<MailPage />} />
              <Route path="/org/:orgId/call" element={<CallsPage />} />
              <Route path="/org/:orgId/calls" element={<CallsPage />} />
              <Route path="/org/:orgId/settings/logs" element={diagnosticsRouteElement} />
              <Route
                path="/org/:orgId/settings/*"
                element={<WebviewWorkspaceMessengerRootRedirect />}
              />
              <Route path="/org/:orgId/logs" element={diagnosticsRouteElement} />
              <Route path="/org/:orgId/services" element={<ServicesPage />} />
              <Route path="/org/:orgId/all-services" element={<ServicesPage />} />
              <Route path="/org/:orgId/licenses" element={<LicensesPage />} />
              <Route path="/org/:orgId/*" element={<WebviewWorkspaceMessengerRootRedirect />} />
              <Route path="*" element={<WebviewWorkspaceMessengerRootRedirect />} />
            </Routes>
          </main>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};
