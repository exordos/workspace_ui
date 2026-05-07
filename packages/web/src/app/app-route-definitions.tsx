import React from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { withCurrentOrgRoute, withOrgRoutePrefix } from "~/shared/lib/org-route";
import { Layout } from "~/widgets/layout/layout.ui";
import { WebViewShell } from "./webview-shell";

const LoginPage = React.lazy(() =>
  import("~/pages/login/login-page.ui").then((m) => ({ default: m.LoginPage })),
);
const PasteTokenPage = React.lazy(() =>
  import("~/pages/login/paste-token-page.ui").then((m) => ({ default: m.PasteTokenPage })),
);
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
const MessageRedirectPage = React.lazy(() =>
  import("~/pages/message-redirect/message-redirect-page.ui").then((m) => ({
    default: m.MessageRedirectPage,
  })),
);
const SettingsPersonalInfoPage = React.lazy(() =>
  import("~/pages/settings/settings-personal-info-page.ui").then((m) => ({
    default: m.SettingsPersonalInfoPage,
  })),
);

export const OrgInboxRedirect: React.FC = () => {
  const { orgId } = useParams<{ orgId?: string }>();
  if (orgId == null || orgId.length === 0) {
    return <Navigate to="/inbox" replace />;
  }
  return <Navigate to={withOrgRoutePrefix("/inbox", orgId)} replace />;
};

export const WebViewAppRoutes: React.FC = () => (
  <Routes>
    <Route path="/webview/*" element={<WebViewShell />} />
    <Route path="/*" element={<WebViewShell />} />
  </Routes>
);

export const LoginAppRoutes: React.FC = () => (
  <Routes>
    <Route path="/paste-token" element={<PasteTokenPage />} />
    <Route path="*" element={<LoginPage />} />
  </Routes>
);

export interface AuthenticatedAppRoutesProps {
  defaultInboxRoute: string;
}

export const AuthenticatedAppRoutes: React.FC<AuthenticatedAppRoutesProps> = ({
  defaultInboxRoute,
}) => {
  const location = useLocation();
  const diagnosticsRouteElement = IS_CONNECTION_DIAGNOSTICS_ENABLED ? (
    <LogsPage />
  ) : (
    <Navigate to={withCurrentOrgRoute("/inbox")} replace />
  );

  return (
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
        <Route path="/settings/personal-info" element={<SettingsPersonalInfoPage />} />
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
        <Route path="settings/personal-info" element={<SettingsPersonalInfoPage />} />
        <Route path="settings/logs" element={diagnosticsRouteElement} />
        <Route path="settings/build" element={<UpdatePage />} />
        <Route
          path="settings/*"
          element={<Navigate to={withCurrentOrgRoute("/inbox")} replace />}
        />
        <Route path="logs" element={diagnosticsRouteElement} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="all-services" element={<ServicesPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="updates" element={<UpdatePage />} />
      </Route>
    </Routes>
  );
};
