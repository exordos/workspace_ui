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
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { selectMode, selectPalette } from "~/features/theme-picker/theme-picker.model";
import { setLocale } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import { withCurrentOrgRoute, withOrgRoutePrefix } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import {
  getNativeBridge,
  onNativeMessage,
  onAuthFromNative,
  type NativeMessage,
} from "~/shared/lib/webview";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "~/shared/ui/error-boundary";

const ChatPage = React.lazy(() =>
  import("~/pages/chat/chat-page.ui").then((m) => ({ default: m.ChatPage })),
);
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
const UpdatePage = React.lazy(() =>
  import("~/pages/update/update-page.ui").then((m) => ({ default: m.UpdatePage })),
);
const LoginPage = React.lazy(() =>
  import("~/pages/login/login-page.ui").then((m) => ({ default: m.LoginPage })),
);
const PasteTokenPage = React.lazy(() =>
  import("~/pages/login/paste-token-page.ui").then((m) => ({ default: m.PasteTokenPage })),
);

const WebviewOrgInboxRedirect: React.FC = () => {
  const { orgId } = useParams<{ orgId?: string }>();
  if (orgId == null || orgId.length === 0) {
    return <Navigate to="/inbox" replace />;
  }
  return <Navigate to={withOrgRoutePrefix("/inbox", orgId)} replace />;
};

export const WebViewShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const addInstance = useInstancesStore((s) => s.addInstance);
  const diagnosticsRouteElement = IS_CONNECTION_DIAGNOSTICS_ENABLED ? (
    <LogsPage />
  ) : (
    <Navigate to={withCurrentOrgRoute("/inbox")} replace />
  );

  useEffect(() => {
    const unsub = onAuthFromNative(({ email, apiKey, realm }) => {
      const workspaceOrgOrigin = workspaceOrgOriginFromLoginServerUrlInput(realm);
      addInstance({
        realm,
        email,
        apiKey,
        ...(workspaceOrgOrigin !== "" ? { workspaceOrgOrigin } : {}),
      });
    });
    return unsub;
  }, [addInstance]);

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
        if (cleaned.startsWith("/") && !cleaned.startsWith("//")) {
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
        pushService
          .unregister()
          .catch(() => {})
          .finally(() => {
            wipeCredentials();
            void navigate("/login");
          });
      }
    });
  }, [navigate]);

  return (
    <div className="safe-area-all flex h-screen flex-col bg-bg text-text-primary">
      <ErrorBoundary fallback={<PageErrorFallback />}>
        <Suspense fallback={<PageLoader />}>
          <main className="touch-scroll flex-1 overflow-auto">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/paste-token" element={<PasteTokenPage />} />
              <Route path="/" element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />} />
              <Route path="/org/:orgId" element={<WebviewOrgInboxRedirect />} />
              <Route path="/stream/:streamSlug" element={<ChatPage />} />
              <Route path="/stream/:streamSlug/topic/:topicName" element={<ChatPage />} />
              <Route path="/dm/:dmId" element={<ChatPage />} />
              <Route path="/activity/:filter" element={<ActivityPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/mail" element={<MailPage />} />
              <Route path="/call" element={<CallsPage />} />
              <Route path="/calls" element={<CallsPage />} />
              <Route
                path="/settings/personal-info"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/settings/logs" element={diagnosticsRouteElement} />
              <Route path="/settings/build" element={<UpdatePage />} />
              <Route
                path="/settings/*"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/logs" element={diagnosticsRouteElement} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/all-services" element={<ServicesPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/updates" element={<UpdatePage />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route path="/org/:orgId/stream/:streamSlug" element={<ChatPage />} />
              <Route
                path="/org/:orgId/stream/:streamSlug/topic/:topicName"
                element={<ChatPage />}
              />
              <Route path="/org/:orgId/dm/:dmId" element={<ChatPage />} />
              <Route path="/org/:orgId/activity/:filter" element={<ActivityPage />} />
              <Route path="/org/:orgId/calendar" element={<CalendarPage />} />
              <Route path="/org/:orgId/mail" element={<MailPage />} />
              <Route path="/org/:orgId/call" element={<CallsPage />} />
              <Route path="/org/:orgId/calls" element={<CallsPage />} />
              <Route
                path="/org/:orgId/settings/personal-info"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/org/:orgId/settings/logs" element={diagnosticsRouteElement} />
              <Route path="/org/:orgId/settings/build" element={<UpdatePage />} />
              <Route
                path="/org/:orgId/settings/*"
                element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
              />
              <Route path="/org/:orgId/logs" element={diagnosticsRouteElement} />
              <Route path="/org/:orgId/services" element={<ServicesPage />} />
              <Route path="/org/:orgId/all-services" element={<ServicesPage />} />
              <Route path="/org/:orgId/inbox" element={<InboxPage />} />
              <Route path="/org/:orgId/feed" element={<FeedPage />} />
              <Route path="/org/:orgId/updates" element={<UpdatePage />} />
              <Route path="/org/:orgId/licenses" element={<LicensesPage />} />
            </Routes>
          </main>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};
