import React from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import {
  workspaceInboxRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Layout } from "~/widgets/layout/layout.ui";
import { WebViewShell } from "./webview-shell";

const LoginPage = React.lazy(() =>
  import("~/pages/login/login-page.ui").then((m) => ({ default: m.LoginPage })),
);
const ChatPage = React.lazy(() =>
  import("~/pages/chat/chat-page.ui").then((m) => ({ default: m.ChatPage })),
);
const FavoritesPage = React.lazy(() =>
  import("~/pages/chat/chat-page.ui").then((m) => ({ default: m.FavoritesPage })),
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

function resolveWorkspaceMessengerRootFromSessions(params: {
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
    return "/";
  }

  return workspaceMessengerRootRoute(routeSession.organizationId, routeSession.projectId);
}

export const WorkspaceMessengerRootRedirect: React.FC = () => {
  const { orgId } = useParams<{ orgId?: string }>();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const target = resolveWorkspaceMessengerRootFromSessions({ sessions, currentAccountId, orgId });
  return <Navigate to={target} replace />;
};

export const WorkspaceMessengerDefaultRedirect: React.FC = () => {
  const { orgId, projectId } = useParams<{ orgId?: string; projectId?: string }>();
  if (orgId == null || orgId.length === 0 || projectId == null || projectId.length === 0) {
    return <WorkspaceMessengerRootRedirect />;
  }
  return <Navigate to={workspaceInboxRoute(orgId, projectId)} replace />;
};

export const WebViewAppRoutes: React.FC = () => (
  <Routes>
    <Route path="/webview/*" element={<WebViewShell />} />
    <Route path="/*" element={<WebViewShell />} />
  </Routes>
);

export const LoginAppRoutes: React.FC = () => (
  <Routes>
    <Route path="*" element={<LoginPage />} />
  </Routes>
);

export interface AuthenticatedAppRoutesProps {
  defaultMessengerRoute: string;
}

export const AuthenticatedAppRoutes: React.FC<AuthenticatedAppRoutesProps> = ({
  defaultMessengerRoute,
}) => {
  const location = useLocation();
  const diagnosticsRouteElement = IS_CONNECTION_DIAGNOSTICS_ENABLED ? (
    <LogsPage />
  ) : (
    <Navigate to={defaultMessengerRoute} replace />
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to={defaultMessengerRoute} replace />} />
      <Route path="/org/:orgId" element={<WorkspaceMessengerRootRedirect />} />
      <Route path="/force-update" element={<UpdatePage forceMode />} />
      <Route path="/org/:orgId/force-update" element={<UpdatePage forceMode />} />
      <Route path="/licenses" element={<LicensesPage />} />
      <Route path="/org/:orgId/licenses" element={<LicensesPage />} />
      <Route element={<Layout />}>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/mail" element={<MailPage />} />
        <Route path="/call" element={<CallsPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/settings/logs" element={diagnosticsRouteElement} />
        <Route path="/settings/build" element={<UpdatePage />} />
        <Route path="/settings/*" element={<Navigate to={defaultMessengerRoute} replace />} />
        <Route path="/logs" element={diagnosticsRouteElement} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/all-services" element={<ServicesPage />} />
        <Route path="/updates" element={<UpdatePage />} />
      </Route>
      <Route path="/org/:orgId" element={<Layout />}>
        <Route
          path="project/:projectId/messenger"
          element={<WorkspaceMessengerDefaultRedirect />}
        />
        <Route path="project/:projectId/inbox" element={<InboxPage />} />
        <Route
          path="project/:projectId/activity/favorites"
          element={<FavoritesPage key={location.pathname} />}
        />
        <Route
          path="project/:projectId/activity/:filter"
          element={<ActivityPage key={location.pathname} />}
        />
        <Route path="project/:projectId/feed" element={<FeedPage />} />
        <Route
          path="project/:projectId/stream/:streamUuid"
          element={<ChatPage key={location.pathname} />}
        />
        <Route
          path="project/:projectId/stream/:streamUuid/topic/:topicUuid"
          element={<ChatPage key={location.pathname} />}
        />
        <Route
          path="project/:projectId/message/:messageUuid"
          element={<ChatPage key={location.pathname} />}
        />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="mail" element={<MailPage />} />
        <Route path="call" element={<CallsPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="settings/logs" element={diagnosticsRouteElement} />
        <Route path="settings/build" element={<UpdatePage />} />
        <Route path="settings/*" element={<WorkspaceMessengerRootRedirect />} />
        <Route path="logs" element={diagnosticsRouteElement} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="all-services" element={<ServicesPage />} />
        <Route path="updates" element={<UpdatePage />} />
      </Route>
      <Route path="/org/:orgId/*" element={<WorkspaceMessengerRootRedirect />} />
      <Route path="*" element={<Navigate to={defaultMessengerRoute} replace />} />
    </Routes>
  );
};
