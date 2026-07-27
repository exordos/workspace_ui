import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
import { removeWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { resolveWorkspacePostLogoutRoute } from "~/entities/workspace-auth/workspace-post-logout-route.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withOrgRoutePrefix } from "~/shared/lib/org-route";
import {
  getOrganizationFallbackLogoUrl,
  getOrganizationLogoSrc,
} from "~/shared/lib/organization-branding";
import { Badge } from "~/shared/ui/badge";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { getBackgroundProjectionUnreadCount } from "./top-bar-workspace-session-unread.lib";

function getHostLabel(baseUrl: string, fallback: string): string {
  try {
    const host = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`).hostname;
    return host || fallback;
  } catch {
    return fallback;
  }
}

const MAX_VISIBLE_SESSIONS = 3;

function getWorkspaceSessionHost(session: WorkspaceAuthSession): string {
  return getHostLabel(session.organizationOrigin, session.organizationId);
}

function getWorkspaceSessionPrimaryLabel(session: WorkspaceAuthSession): string {
  const login = session.login.trim();
  return login.length > 0 ? login : session.userUuid;
}

function getWorkspaceSessionSecondaryLabel(session: WorkspaceAuthSession): string {
  const host = getWorkspaceSessionHost(session);
  return `${host} · ${session.projectId}`;
}

function getWorkspaceSessionTitle(session: WorkspaceAuthSession): string {
  return `${getWorkspaceSessionPrimaryLabel(session)} · ${getWorkspaceSessionSecondaryLabel(
    session,
  )}`;
}

function getWorkspaceSessionOwnerKey(session: WorkspaceAuthSession): string {
  return workspaceRuntimeOwnerKey({
    accountId: session.accountId,
    instanceId: session.instanceId,
    organizationId: session.organizationId,
    projectId: session.projectId,
    userUuid: session.userUuid,
  });
}

const OrganizationLogo = React.memo(function OrganizationLogo({
  logoUrl,
  baseUrl,
  className,
}: {
  logoUrl?: string;
  baseUrl?: string;
  className: string;
}) {
  const preferredSrc = React.useMemo(
    () => getOrganizationLogoSrc(logoUrl, baseUrl),
    [logoUrl, baseUrl],
  );
  const [logoSrc, setLogoSrc] = React.useState(preferredSrc);

  React.useEffect(() => {
    setLogoSrc(preferredSrc);
  }, [preferredSrc]);

  const handleError = React.useCallback(() => {
    const fallback = getOrganizationFallbackLogoUrl();
    setLogoSrc((current) => (current === fallback ? current : fallback));
  }, []);

  return <img src={logoSrc} alt="" className={className} onError={handleError} />;
});

const InstanceQuickButton = React.memo(function InstanceQuickButton({
  instanceId,
  label,
  isActive,
  unreadCount,
  logoUrl,
  baseUrl,
  onSelect,
}: {
  instanceId: string;
  label: string;
  isActive: boolean;
  unreadCount: number;
  logoUrl?: string;
  baseUrl?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(instanceId)}
      data-testid={`instance-quick-${instanceId}`}
      className={`focus-visible:ring-accent/40 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 ${
        isActive
          ? "bg-card-bg-active text-text-primary"
          : "bg-transparent text-text-muted hover:bg-card-bg-active hover:text-text-primary"
      }`}
      aria-label={isActive ? `${t("auth.currentServer")}: ${label}` : label}
      title={label}
    >
      <span
        data-testid={`instance-frame-${instanceId}`}
        className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-bg ${
          isActive ? "ring-2 ring-inset ring-border-subtle" : ""
        }`}
      >
        <OrganizationLogo logoUrl={logoUrl} baseUrl={baseUrl} className="h-9 w-9 object-contain" />
      </span>
      {unreadCount > 0 && (
        <span
          className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-bg-elevated bg-badge-bg"
          aria-hidden="true"
        />
      )}
    </button>
  );
});

export const InstanceSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const workspaceSessions = useWorkspaceAuthStore((s) => s.sessions);
  const currentWorkspaceAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const setCurrentWorkspaceAccountId = useWorkspaceAuthStore((s) => s.setCurrentAccountId);
  const getCurrentWorkspaceSession = useWorkspaceAuthStore((s) => s.getCurrentSession);
  const backgroundProjectionsByOwnerKey = useMessengerBackgroundProjectionStore(
    (s) => s.projectionsByOwnerKey,
  );

  const visibleWorkspaceSessions = React.useMemo(
    () => workspaceSessions.slice(0, MAX_VISIBLE_SESSIONS),
    [workspaceSessions],
  );
  const hiddenWorkspaceSessionsCount = workspaceSessions.length - visibleWorkspaceSessions.length;
  const handleSelectWorkspaceSession = React.useCallback(
    (accountId: string) => {
      const selectedSession = workspaceSessions.find((session) => session.accountId === accountId);
      if (selectedSession == null) return;
      if (accountId !== currentWorkspaceAccountId) {
        setCurrentWorkspaceAccountId(accountId);
      }

      const messengerPath = resolveMessengerNavigationPath({
        instanceId: selectedSession.instanceId,
        projectId: selectedSession.projectId,
      });
      const targetPath = withOrgRoutePrefix(messengerPath, selectedSession.organizationId);
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (targetPath !== currentPath) {
        void navigate(targetPath, { replace: true });
      }
    },
    [
      currentWorkspaceAccountId,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      setCurrentWorkspaceAccountId,
      workspaceSessions,
    ],
  );

  const menuItems = React.useMemo<DropdownMenuItem[]>(() => {
    return [
      ...workspaceSessions.map((session) => {
        const primaryLabel = getWorkspaceSessionPrimaryLabel(session);
        const secondaryLabel = getWorkspaceSessionSecondaryLabel(session);
        const title = getWorkspaceSessionTitle(session);
        const unreadCount = getBackgroundProjectionUnreadCount(
          backgroundProjectionsByOwnerKey[getWorkspaceSessionOwnerKey(session)],
        );
        return {
          type: "action" as const,
          key: `workspace-session-${session.accountId}`,
          onSelect: () => handleSelectWorkspaceSession(session.accountId),
          className:
            session.accountId === currentWorkspaceAccountId
              ? "rounded-lg bg-card-bg-active"
              : undefined,
          label: (
            <>
              <span
                data-testid={`workspace-session-logo-${session.accountId}`}
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-lg bg-bg ${
                  session.accountId === currentWorkspaceAccountId
                    ? "ring-2 ring-inset ring-border-subtle"
                    : ""
                }`}
              >
                <OrganizationLogo
                  baseUrl={session.organizationOrigin}
                  className="h-9 w-9 object-contain"
                />
                {unreadCount > 0 && (
                  <span
                    data-testid={`workspace-session-unread-${session.accountId}`}
                    className="pointer-events-none absolute right-0 top-0"
                  >
                    <Badge count={unreadCount} variant="unread" />
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="w-full truncate font-medium" title={title}>
                  {primaryLabel}
                </span>
                <span className="w-full truncate text-xs text-text-muted">{secondaryLabel}</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const confirmed = window.confirm(
                    t("auth.logoutFromOrgConfirm", { server: title }),
                  );
                  if (!confirmed) return;
                  const removedCurrentSession = session.accountId === currentWorkspaceAccountId;
                  void removeWorkspaceSession(session.accountId).then(() => {
                    if (!removedCurrentSession) return;
                    const nextRoute = resolveWorkspacePostLogoutRoute(getCurrentWorkspaceSession());
                    const currentPath = `${location.pathname}${location.search}${location.hash}`;
                    if (nextRoute !== currentPath) {
                      void navigate(nextRoute, { replace: true });
                    }
                  });
                }}
                className="hover:bg-notice-base/20 border-notice-base/40 bg-notice-base/10 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-notice-base transition-colors"
                aria-label={t("auth.logoutFromOrg")}
                title={t("auth.logoutFromOrg")}
              >
                <Icon name="logout" size={14} className="text-current" />
              </button>
            </>
          ),
        };
      }),
      { type: "separator" as const },
      {
        type: "action" as const,
        key: "add-server",
        onSelect: () => {
          void navigate("/login");
        },
        label: (
          <>
            <Icon name="add" size={16} className="text-text-muted" />
            {t("auth.addServer")}
          </>
        ),
      },
    ];
  }, [
    currentWorkspaceAccountId,
    backgroundProjectionsByOwnerKey,
    handleSelectWorkspaceSession,
    getCurrentWorkspaceSession,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    workspaceSessions,
  ]);

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t("auth.selectServer")}>
      {visibleWorkspaceSessions.map((session) => {
        const title = getWorkspaceSessionTitle(session);
        const unreadCount = getBackgroundProjectionUnreadCount(
          backgroundProjectionsByOwnerKey[getWorkspaceSessionOwnerKey(session)],
        );
        return (
          <InstanceQuickButton
            key={session.accountId}
            instanceId={session.accountId}
            label={title}
            isActive={session.accountId === currentWorkspaceAccountId}
            unreadCount={unreadCount}
            baseUrl={session.organizationOrigin}
            onSelect={handleSelectWorkspaceSession}
          />
        );
      })}

      {hiddenWorkspaceSessionsCount > 0 && (
        <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted">
          +{hiddenWorkspaceSessionsCount}
        </span>
      )}

      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={menuItems}
        contentVariant="wide"
        contentProps={{ sideOffset: 6, align: "start" }}
        trigger={
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
            aria-label={t("auth.selectServer")}
            title={t("auth.selectServer")}
          >
            <Icon name="chevron-down" size={14} className="text-current" />
          </button>
        }
      />
    </div>
  );
};
