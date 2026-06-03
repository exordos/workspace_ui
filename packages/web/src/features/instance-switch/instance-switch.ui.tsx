import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { buildOrgRouteIdForZulipInstance, withOrgRoutePrefix } from "~/shared/lib/org-route";
import {
  getOrganizationFallbackLogoUrl,
  getOrganizationLogoSrc,
} from "~/shared/lib/organization-branding";
import { Badge } from "~/shared/ui/badge";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";

function getInstanceLabel(realm: string, email: string): string {
  try {
    const host = new URL(realm.startsWith("http") ? realm : `https://${realm}`).hostname;
    return host || email;
  } catch {
    return email;
  }
}

const MAX_VISIBLE_INSTANCES = 3;

const OrganizationLogo = React.memo(function OrganizationLogo({
  realmIcon,
  realmBaseUrl,
  className,
}: {
  realmIcon?: string;
  realmBaseUrl?: string;
  className: string;
}) {
  const preferredSrc = React.useMemo(
    () => getOrganizationLogoSrc(realmIcon, realmBaseUrl),
    [realmIcon, realmBaseUrl],
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
  realmIcon,
  realmBaseUrl,
  onSelect,
}: {
  instanceId: string;
  label: string;
  isActive: boolean;
  unreadCount: number;
  realmIcon?: string;
  realmBaseUrl?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(instanceId)}
      data-testid={`instance-quick-${instanceId}`}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
        isActive
          ? "bg-transparent text-text-primary"
          : "hover:bg-bg/50 bg-transparent text-text-muted hover:text-text-primary"
      }`}
      aria-label={isActive ? `${t("auth.currentServer")}: ${label}` : label}
      title={label}
    >
      <OrganizationLogo
        realmIcon={realmIcon}
        realmBaseUrl={realmBaseUrl}
        className="h-9 w-9 object-contain"
      />
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
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const removeInstance = useInstancesStore((s) => s.removeInstance);
  const unreadCountsByInstance = useInstancesStore((s) => s.unreadCountsByInstance);

  const visibleInstances = React.useMemo(
    () => instances.slice(0, MAX_VISIBLE_INSTANCES),
    [instances],
  );
  const hiddenInstancesCount = instances.length - visibleInstances.length;
  const handleSelectInstance = React.useCallback(
    (id: string) => {
      if (id === currentInstanceId) return;
      const selectedInstance = instances.find((instance) => instance.id === id);
      if (selectedInstance == null) return;
      // Chat context (DM/stream/topic) is org-scoped — always navigate to inbox after switch.
      const inboxPath = withOrgRoutePrefix(
        "/inbox",
        buildOrgRouteIdForZulipInstance(selectedInstance),
      );
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      // Route is the org-context source of truth: fix instance desync in place, or navigate first.
      if (inboxPath === currentPath) {
        setCurrentInstanceId(id);
        return;
      }
      void navigate(inboxPath, { replace: true });
    },
    [
      instances,
      currentInstanceId,
      location.pathname,
      location.search,
      location.hash,
      navigate,
      setCurrentInstanceId,
    ],
  );

  const menuItems = React.useMemo<DropdownMenuItem[]>(
    () => [
      ...instances.map((inst) => {
        const label = getInstanceLabel(inst.realm, inst.email);
        const unreadCount = unreadCountsByInstance[inst.id] ?? 0;
        return {
          type: "action" as const,
          key: `instance-${inst.id}`,
          onSelect: () => handleSelectInstance(inst.id),
          label: (
            <>
              <span
                data-testid={`instance-logo-${inst.id}`}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-bg"
              >
                <OrganizationLogo
                  realmIcon={inst.realmIcon}
                  realmBaseUrl={inst.realm}
                  className="h-9 w-9 object-contain"
                />
                {unreadCount > 0 && (
                  <span
                    data-testid={`instance-unread-${inst.id}`}
                    className="pointer-events-none absolute right-0 top-0"
                  >
                    <Badge count={unreadCount} variant="unread" />
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="w-full truncate font-medium">{label}</span>
                <span className="w-full truncate text-xs text-text-muted">{inst.email}</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const confirmed = window.confirm(
                    t("auth.logoutFromOrgConfirm", { server: label }),
                  );
                  if (!confirmed) return;
                  removeInstance(inst.id);
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
    ],
    [handleSelectInstance, instances, navigate, removeInstance, unreadCountsByInstance],
  );

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t("auth.selectServer")}>
      {visibleInstances.map((inst) => {
        const label = getInstanceLabel(inst.realm, inst.email);
        const unreadCount = unreadCountsByInstance[inst.id] ?? 0;
        return (
          <InstanceQuickButton
            key={inst.id}
            instanceId={inst.id}
            label={label}
            isActive={inst.id === currentInstanceId}
            unreadCount={unreadCount}
            realmIcon={inst.realmIcon}
            realmBaseUrl={inst.realm}
            onSelect={handleSelectInstance}
          />
        );
      })}

      {hiddenInstancesCount > 0 && (
        <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted">
          +{hiddenInstancesCount}
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
            className="hover:bg-bg/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted transition-colors hover:text-text-primary"
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
