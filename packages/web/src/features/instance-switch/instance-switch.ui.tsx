import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { buildOrgRouteIdFromRealm, replaceOrgRouteInPath } from "~/shared/lib/org-route";
import {
  getOrganizationLogoSrc,
  ORGANIZATION_FALLBACK_LOGO_URL,
} from "~/shared/lib/organization-branding";
import { Badge } from "~/shared/ui/badge";
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
  className,
}: {
  realmIcon?: string;
  className: string;
}) {
  const preferredSrc = React.useMemo(() => getOrganizationLogoSrc(realmIcon), [realmIcon]);
  const [logoSrc, setLogoSrc] = React.useState(preferredSrc);

  React.useEffect(() => {
    setLogoSrc(preferredSrc);
  }, [preferredSrc]);

  const handleError = React.useCallback(() => {
    setLogoSrc((current) =>
      current === ORGANIZATION_FALLBACK_LOGO_URL ? current : ORGANIZATION_FALLBACK_LOGO_URL,
    );
  }, []);

  return <img src={logoSrc} alt="" className={className} onError={handleError} />;
});

const InstanceQuickButton = React.memo(function InstanceQuickButton({
  instanceId,
  label,
  isActive,
  unreadCount,
  realmIcon,
  onSelect,
}: {
  instanceId: string;
  label: string;
  isActive: boolean;
  unreadCount: number;
  realmIcon?: string;
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
      <OrganizationLogo realmIcon={realmIcon} className="h-9 w-9 object-contain" />
      {unreadCount > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-bg-elevated bg-badge-bg"
          aria-hidden="true"
        />
      )}
    </button>
  );
});

export const InstanceSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
      const selectedInstance = instances.find((instance) => instance.id === id);
      if (selectedInstance == null) return;
      setCurrentInstanceId(id);

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = replaceOrgRouteInPath(
        currentPath,
        buildOrgRouteIdFromRealm(selectedInstance.realm),
      );
      if (nextPath !== currentPath) {
        void navigate(nextPath, { replace: true });
      }
    },
    [instances, location.pathname, location.search, location.hash, navigate, setCurrentInstanceId],
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
            onSelect={handleSelectInstance}
          />
        );
      })}

      {hiddenInstancesCount > 0 && (
        <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-text-muted">
          +{hiddenInstancesCount}
        </span>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="hover:bg-bg/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("auth.selectServer")}
            title={t("auth.selectServer")}
          >
            <Icon name="chevron-down" size={14} className="text-current" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-dropdown min-w-context-menu-wide rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
            sideOffset={6}
            align="start"
          >
            {instances.map((inst) => {
              const label = getInstanceLabel(inst.realm, inst.email);
              const unreadCount = unreadCountsByInstance[inst.id] ?? 0;
              return (
                <DropdownMenu.Item
                  key={inst.id}
                  onSelect={() => handleSelectInstance(inst.id)}
                  className="hover:bg-bg/80 data-[highlighted]:bg-accent/20 group/item flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <span
                    data-testid={`instance-logo-${inst.id}`}
                    className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg"
                  >
                    <OrganizationLogo
                      realmIcon={inst.realmIcon}
                      className="h-9 w-9 object-contain"
                    />
                    {unreadCount > 0 && (
                      <span
                        data-testid={`instance-unread-${inst.id}`}
                        className="pointer-events-none absolute -right-1 -top-1"
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
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
                </DropdownMenu.Item>
              );
            })}
            <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />
            <DropdownMenu.Item
              onSelect={() => navigate("/login")}
              className="hover:bg-bg/80 data-[highlighted]:bg-accent/20 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none"
            >
              <Icon name="add" size={16} className="text-text-muted" />
              {t("auth.addServer")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};
