import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
import { removeWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceReauthRequiredAccount,
} from "~/entities/workspace-auth/workspace-auth.model";
import { resolveWorkspacePostLogoutRoute } from "~/entities/workspace-auth/workspace-post-logout-route.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { WorkspaceLoginForm } from "~/features/workspace-login/workspace-login-form.ui";
import { t } from "~/i18n/i18n";
import { UNREAD_COUNT_DISPLAY_LIMIT } from "~/shared/lib/count-format.lib";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withOrgRoutePrefix } from "~/shared/lib/org-route";
import {
  getOrganizationFallbackLogoUrl,
  getOrganizationLogoSrc,
} from "~/shared/lib/organization-branding";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog";
import { AppTooltip } from "~/shared/ui/app-tooltip";
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

function getWorkspaceSessionHost(session: WorkspaceReauthRequiredAccount): string {
  return getHostLabel(session.organizationOrigin, session.organizationId);
}

function getWorkspaceSessionPrimaryLabel(session: WorkspaceReauthRequiredAccount): string {
  const login = session.login.trim();
  return login.length > 0 ? login : session.userUuid;
}

function getWorkspaceSessionSecondaryLabel(session: WorkspaceReauthRequiredAccount): string {
  const host = getWorkspaceSessionHost(session);
  return `${host} · ${session.projectId}`;
}

function getWorkspaceSessionTitle(session: WorkspaceReauthRequiredAccount): string {
  return `${getWorkspaceSessionPrimaryLabel(session)} · ${getWorkspaceSessionSecondaryLabel(
    session,
  )}`;
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
  displayName,
  isActive,
  unreadCount,
  reauthRequired,
  logoUrl,
  baseUrl,
  onSelect,
}: {
  instanceId: string;
  label: string;
  displayName: string;
  isActive: boolean;
  unreadCount: number;
  reauthRequired: boolean;
  logoUrl?: string;
  baseUrl?: string;
  onSelect: (id: string) => void;
}) {
  const accountLabel = isActive ? `${t("auth.currentServer")}: ${label}` : label;
  const statusLabel = reauthRequired ? t("auth.reauthRequired") : null;
  return (
    <AppTooltip
      content={statusLabel == null ? displayName : `${displayName} · ${statusLabel}`}
      side="bottom"
      align="center"
      size="compact"
      textTone="primary"
      closeDelay={0}
    >
      <button
        type="button"
        onClick={() => onSelect(instanceId)}
        data-testid={`instance-quick-${instanceId}`}
        className={`focus-visible:ring-accent/40 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 ${
          isActive
            ? "bg-card-bg-active text-text-primary"
            : "bg-transparent text-text-muted hover:bg-card-bg-active hover:text-text-primary"
        }`}
        aria-label={statusLabel == null ? accountLabel : `${accountLabel} · ${statusLabel}`}
      >
        <span
          data-testid={`instance-frame-${instanceId}`}
          className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-bg ${
            isActive ? "ring-2 ring-inset ring-border-subtle" : ""
          }`}
        >
          <OrganizationLogo
            logoUrl={logoUrl}
            baseUrl={baseUrl}
            className="h-9 w-9 object-contain"
          />
        </span>
        {reauthRequired ? (
          <span
            className="absolute right-0 top-0 rounded-full bg-bg-elevated text-notice-base"
            aria-hidden="true"
          >
            <Icon name="warning" size={14} />
          </span>
        ) : (
          unreadCount > 0 && (
            <span
              className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-bg-elevated bg-badge-bg"
              aria-hidden="true"
            />
          )
        )}
      </button>
    </AppTooltip>
  );
});

export const InstanceSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [dialogTarget, setDialogTarget] = React.useState<{
    account: WorkspaceReauthRequiredAccount;
    trigger: HTMLElement | null;
  } | null>(null);
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogTriggerRef = React.useRef<HTMLElement | null>(null);
  const workspaceSessions = useWorkspaceAuthStore((s) => s.sessions);
  const reauthRequiredAccounts = useWorkspaceAuthStore((s) => s.reauthRequiredAccounts);
  const currentWorkspaceAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const setCurrentWorkspaceAccountId = useWorkspaceAuthStore((s) => s.setCurrentAccountId);
  const backgroundProjectionsByOwnerKey = useMessengerBackgroundProjectionStore(
    (s) => s.projectionsByOwnerKey,
  );

  const savedAccounts = React.useMemo(
    () => [...workspaceSessions, ...reauthRequiredAccounts],
    [workspaceSessions, reauthRequiredAccounts],
  );
  const visibleWorkspaceSessions = savedAccounts.slice(0, MAX_VISIBLE_SESSIONS);
  const hiddenWorkspaceSessionsCount = savedAccounts.length - visibleWorkspaceSessions.length;
  const reauthRequiredIds = React.useMemo(
    () => new Set(reauthRequiredAccounts.map((account) => account.accountId)),
    [reauthRequiredAccounts],
  );
  const hiddenReauthRequired = savedAccounts
    .slice(MAX_VISIBLE_SESSIONS)
    .some((account) => reauthRequiredIds.has(account.accountId));
  const menuLabel = hiddenReauthRequired
    ? `${t("auth.selectServer")} · ${t("auth.reauthRequired")}`
    : t("auth.selectServer");
  const dialogAccount =
    dialogTarget != null &&
    dialogTarget.account.accountId !== currentWorkspaceAccountId &&
    reauthRequiredAccounts.includes(dialogTarget.account)
      ? dialogTarget.account
      : null;
  const closeReauthDialog = React.useCallback(() => setDialogTarget(null), []);
  React.useLayoutEffect(() => {
    if (dialogTarget != null) dialogTriggerRef.current = dialogTarget.trigger;
  }, [dialogTarget]);
  const handleSelectWorkspaceSession = React.useCallback(
    (accountId: string) => {
      const reauthAccount = reauthRequiredAccounts.find(
        (account) => account.accountId === accountId,
      );
      if (reauthAccount != null) {
        if (accountId !== currentWorkspaceAccountId) {
          setDialogTarget({
            account: reauthAccount,
            trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
          });
        }
        return;
      }
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
      if (targetPath !== currentPath) {
        void navigate(targetPath, { replace: true });
      }
    },
    [
      currentWorkspaceAccountId,
      currentPath,
      navigate,
      reauthRequiredAccounts,
      setCurrentWorkspaceAccountId,
      workspaceSessions,
    ],
  );

  const handleLogout = (accountId: string, title: string) => {
    if (!window.confirm(t("auth.logoutFromOrgConfirm", { server: title }))) return;
    const removedCurrentSession = accountId === currentWorkspaceAccountId;
    void removeWorkspaceSession(accountId).then(() => {
      if (!removedCurrentSession) return;
      const state = useWorkspaceAuthStore.getState();
      const nextAccount =
        state.getCurrentSession() ??
        state.reauthRequiredAccounts.find(
          (account) => account.accountId === state.currentAccountId,
        );
      const nextRoute = resolveWorkspacePostLogoutRoute(nextAccount);
      if (nextRoute !== currentPath) {
        void navigate(nextRoute, { replace: true });
      }
    });
  };

  const menuItems: DropdownMenuItem[] = [
    ...savedAccounts.map((session) => {
      const primaryLabel = getWorkspaceSessionPrimaryLabel(session);
      const secondaryLabel = getWorkspaceSessionSecondaryLabel(session);
      const title = getWorkspaceSessionTitle(session);
      const reauthRequired = reauthRequiredIds.has(session.accountId);
      const unreadCount = reauthRequired
        ? 0
        : getBackgroundProjectionUnreadCount(
            backgroundProjectionsByOwnerKey[workspaceRuntimeOwnerKey(session)],
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
                  <Badge
                    maxCount={UNREAD_COUNT_DISPLAY_LIMIT}
                    count={unreadCount}
                    variant="unread"
                  />
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="w-full truncate font-medium" title={title}>
                {primaryLabel}
              </span>
              <span className="w-full truncate text-xs text-text-muted">{secondaryLabel}</span>
              {reauthRequired && (
                <span className="w-full truncate text-xs text-notice-base">
                  {t("auth.reauthRequired")}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleLogout(session.accountId, title);
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

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t("auth.selectServer")}>
      {visibleWorkspaceSessions.map((session) => {
        const title = getWorkspaceSessionTitle(session);
        const displayName =
          [session.profile.firstName?.trim(), session.profile.lastName?.trim()]
            .filter(Boolean)
            .join(" ") || session.profile.username.trim();
        const reauthRequired = reauthRequiredIds.has(session.accountId);
        const unreadCount = reauthRequired
          ? 0
          : getBackgroundProjectionUnreadCount(
              backgroundProjectionsByOwnerKey[workspaceRuntimeOwnerKey(session)],
            );
        return (
          <InstanceQuickButton
            key={session.accountId}
            instanceId={session.accountId}
            label={title}
            displayName={displayName}
            isActive={session.accountId === currentWorkspaceAccountId}
            unreadCount={unreadCount}
            reauthRequired={reauthRequired}
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
            ref={menuTriggerRef}
            type="button"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
            aria-label={menuLabel}
            title={menuLabel}
          >
            <Icon name="chevron-down" size={14} className="text-current" />
            {hiddenReauthRequired && (
              <span
                className="absolute right-0 top-0 rounded-full bg-bg-elevated text-notice-base"
                aria-hidden="true"
              >
                <Icon name="warning" size={12} />
              </span>
            )}
          </button>
        }
      />
      <AppDialog
        open={dialogAccount != null}
        onOpenChange={(open) => {
          if (!open) closeReauthDialog();
        }}
        title={t("auth.reauthTitle")}
        description={t("auth.reauthSessionEnded")}
        positionClassName="top-1/2 -translate-y-1/2"
        footer={<DialogCancelButton>{t("common.cancel")}</DialogCancelButton>}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = dialogTriggerRef.current;
          if (trigger?.isConnected && trigger.tagName === "BUTTON") trigger.focus();
          else menuTriggerRef.current?.focus();
          dialogTriggerRef.current = null;
        }}
        scrollBody
      >
        {dialogAccount != null && (
          <WorkspaceLoginForm
            key={dialogAccount.accountId}
            reauthAccount={dialogAccount}
            onSuccess={closeReauthDialog}
            embedded
          />
        )}
      </AppDialog>
    </div>
  );
};
