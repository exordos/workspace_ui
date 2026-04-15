import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { NotificationSound } from "~/features/settings/settings.types";
import {
  getAvailablePalettes,
  selectPalette,
  selectMode,
} from "~/features/theme-picker/theme-picker.model";
import { useTranslation } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import { clearLocalStatePreservingCriticalKeys } from "~/shared/lib/local-reset";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { resolveOrganizationLogoUrl } from "~/shared/lib/organization-branding";
import { pushService } from "~/shared/lib/push/push.service";
import { Icon } from "~/shared/ui/icon";
import type { MenuItem, ProfileDrawerProps } from "./profile-drawer.types";

const log = createLogger("profile-drawer");
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

const NOTIFICATION_SOUNDS: NotificationSound[] = [
  "default",
  "subtle",
  "digital",
  "glass",
  "pulse",
  "none",
];
const NOTIFICATION_SOUND_LABEL_KEYS: Record<NotificationSound, string> = {
  default: "settings.soundDefault",
  subtle: "settings.soundSubtle",
  digital: "settings.soundDigital",
  glass: "settings.soundGlass",
  pulse: "settings.soundPulse",
  none: "settings.soundNone",
};

const THEME_MODES = ["light", "dark", "system"] as const;
const MODE_LABEL_KEYS: Record<(typeof THEME_MODES)[number], string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};

function getInstanceLabel(realm: string, email: string): string {
  try {
    const host = new URL(realm.startsWith("http") ? realm : `https://${realm}`).hostname;
    return host || email;
  } catch {
    return email;
  }
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  open,
  onOpenChange,
  onOpenSettingsDrawer,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const { t, locale: currentLocale, setLocale, supportedLocales: locales } = useTranslation();
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const removeInstance = useInstancesStore((s) => s.removeInstance);
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const setPrioritizePersonalUnread = useSettingsStore((s) => s.setPrioritizePersonalUnread);
  const setPrioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.setPrioritizeUnmutedUnreadChannels,
  );
  const notificationSound = useSettingsStore((s) => s.notificationSound);
  const setNotificationSound = useSettingsStore((s) => s.setNotificationSound);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const currentMode = useThemeStore((s) => s.mode);
  const currentPaletteId = useThemeStore((s) => s.paletteId);
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);
  const currentLocaleName =
    locales.find((l) => l.id === currentLocale)?.nativeLabel ?? currentLocale;
  const currentInstance = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId) ?? null,
    [instances, currentInstanceId],
  );
  const currentServerLabel = useMemo(
    () => (currentInstance ? getInstanceLabel(currentInstance.realm, currentInstance.email) : ""),
    [currentInstance],
  );
  const currentServerIconUrl = useMemo(
    () => resolveOrganizationLogoUrl(currentInstance?.realmIcon, currentInstance?.realm),
    [currentInstance?.realmIcon, currentInstance?.realm],
  );

  const handleCycleLanguage = useCallback(() => {
    const idx = locales.findIndex((l) => l.id === currentLocale);
    const next = locales[(idx + 1) % locales.length]!;
    setLocale(next.id);
    setLanguage(next.id as "en" | "ru");
  }, [currentLocale, locales, setLanguage, setLocale]);

  const handleCycleNotificationSound = useCallback(() => {
    const idx = NOTIFICATION_SOUNDS.indexOf(notificationSound);
    const next = NOTIFICATION_SOUNDS[(idx + 1) % NOTIFICATION_SOUNDS.length]!;
    setNotificationSound(next);
  }, [notificationSound, setNotificationSound]);

  const handleClearCache = useCallback(() => {
    log.info("Clearing application cache");
    clearLocalStatePreservingCriticalKeys();
    window.location.reload();
  }, []);

  const handleLogout = useCallback(() => {
    log.info("User initiated logout");
    void pushService.unregister().catch(() => {});
    wipeCredentials();
    onOpenChange(false);
    void navigate("/login");
  }, [navigate, onOpenChange]);

  const handleLogoutFromCurrentOrg = useCallback(() => {
    if (currentInstance == null) return;
    const confirmed = window.confirm(
      t("auth.logoutFromOrgConfirm", { server: currentServerLabel }),
    );
    if (!confirmed) return;
    removeInstance(currentInstance.id);
    onOpenChange(false);
  }, [currentInstance, currentServerLabel, removeInstance, onOpenChange, t]);

  const profileItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      {
        label: t("settings.settings"),
        icon: "grid",
        action: "openSettingsDrawer",
      },
      {
        label: t("settings.personalInfo"),
        icon: "accountCircle",
        action: "openPersonalInfoPanel",
      },
      {
        label: t("settings.appVersion"),
        icon: "info",
        subtitle: APP_VERSION,
        navigateTo: "/settings/build",
      },
      {
        label: t("settings.selectBuild"),
        icon: "grid",
        navigateTo: "/settings/build",
        subtitle: t("settings.selectBuildHint"),
      },
      {
        label: t("settings.notificationSound"),
        icon: "volumeUp",
        action: "cycleNotificationSound",
        right: (
          <span className="flex items-center gap-1 text-sm text-text-primary">
            {t(NOTIFICATION_SOUND_LABEL_KEYS[notificationSound])}
            <Icon name="chevron-down" size={16} className="text-current" />
          </span>
        ),
      },
      {
        label: t("settings.language"),
        icon: "language",
        action: "cycleLanguage",
        right: (
          <span className="flex items-center gap-1 text-sm text-text-primary">
            {currentLocaleName}
            <Icon name="chevron-down" size={16} className="text-current" />
          </span>
        ),
      },
      { label: t("settings.themeSettings"), icon: "mood", action: "themeSettings" },
      {
        label: t("settings.chatSorting"),
        icon: "channels",
        action: "chatSorting",
        subtitle: t("settings.chatSortingHint"),
      },
      {
        label: t("settings.clearCache"),
        icon: "delete",
        action: "clearCache",
        subtitle: t("settings.clearCacheHint"),
      },
      {
        label: t("auth.logout"),
        icon: "logout",
        destructive: true,
        action: "logout",
      },
    ];

    if (IS_CONNECTION_DIAGNOSTICS_ENABLED) {
      items.splice(2, 0, {
        label: t("settings.connectionDiagnostics"),
        icon: "visibility",
        navigateTo: "/settings/logs",
      });
    }

    return items;
  }, [t, currentLocaleName, notificationSound]);

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (item.action === "cycleLanguage") {
        handleCycleLanguage();
        return;
      }
      if (item.action === "cycleNotificationSound") {
        handleCycleNotificationSound();
        return;
      }
      if (item.action === "clearCache") {
        handleClearCache();
        return;
      }
      if (item.action === "openPersonalInfoPanel") {
        if (currentUserId != null && rightDrawer?.openUserProfile != null) {
          rightDrawer.openUserProfile(currentUserId);
          onOpenChange(false);
          return;
        }
        void navigate(withCurrentOrgRoute("/settings/personal-info"));
        onOpenChange(false);
        return;
      }
      if (item.action === "logout") {
        handleLogout();
        return;
      }
      if (item.action === "openSettingsDrawer") {
        onOpenSettingsDrawer?.();
        onOpenChange(false);
        return;
      }
      if (item.navigateTo) {
        void navigate(item.navigateTo);
        onOpenChange(false);
      }
    },
    [
      navigate,
      onOpenChange,
      handleCycleLanguage,
      handleCycleNotificationSound,
      handleClearCache,
      handleLogout,
      currentUserId,
      rightDrawer,
      onOpenSettingsDrawer,
    ],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal bg-black/50" />
        <Dialog.Content
          className="fixed bottom-0 right-0 top-0 z-modal flex w-full max-w-drawer-profile flex-col bg-sidebar-bg shadow-xl outline-none"
          onPointerDownOutside={() => onOpenChange(false)}
          onEscapeKeyDown={() => onOpenChange(false)}
          aria-describedby={undefined}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-4">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              {t("nav.profile")}
            </Dialog.Title>
            <Dialog.Close
              asChild
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              aria-label={t("common.close")}
            >
              <button type="button">
                <Icon name="close" size={20} className="text-current" />
              </button>
            </Dialog.Close>
          </div>
          {currentInstance != null && (
            <section className="mx-3 mt-3 rounded-lg border border-border-subtle bg-bg-elevated p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("auth.currentServer")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg">
                  {currentServerIconUrl != null ? (
                    <img
                      src={currentServerIconUrl}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                    />
                  ) : (
                    <Icon name="chatBubble" size={14} className="text-text-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {currentServerLabel}
                  </p>
                  <p className="truncate text-xs text-text-muted">{currentInstance.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutFromCurrentOrg}
                  className="hover:bg-notice-base/20 border-notice-base/40 bg-notice-base/10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-notice-base transition-colors"
                  aria-label={t("auth.logoutFromOrg")}
                  title={t("auth.logoutFromOrg")}
                >
                  <Icon name="logout" size={14} className="text-current" />
                </button>
              </div>
            </section>
          )}
          <nav className="flex-1 overflow-y-auto py-2">
            <ul className="space-y-0.5 px-3">
              {profileItems.map((item, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                      item.highlighted
                        ? "bg-bg-elevated hover:bg-card-bg-active"
                        : item.destructive
                          ? "hover:bg-notice-base/10 text-notice-base"
                          : "text-text-primary hover:bg-bg-elevated"
                    } ${item.destructive ? "text-notice-base" : ""}`}
                  >
                    {item.icon && (
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.destructive ? "bg-notice-base/20" : "bg-bg-elevated"
                        }`}
                      >
                        <Icon
                          name={item.icon}
                          size={20}
                          className={item.destructive ? "text-notice-base" : "text-accent"}
                        />
                      </span>
                    )}
                    {!item.icon && item.highlighted && (
                      <span className="h-9 w-9 shrink-0 rounded-full bg-bg-elevated" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col items-start">
                      <span
                        className={`text-sm font-medium ${
                          item.destructive ? "text-notice-base" : "text-text-primary"
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.subtitle && (
                        <span className="mt-0.5 text-[12px] text-text-muted">{item.subtitle}</span>
                      )}
                    </div>
                    {item.right && <div className="shrink-0">{item.right}</div>}
                  </button>
                  {item.action === "themeSettings" && (
                    <div className="space-y-3 px-3 py-2">
                      <div className="flex gap-1">
                        {THEME_MODES.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => selectMode(mode)}
                            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                              currentMode === mode
                                ? "bg-accent text-on-accent"
                                : "bg-bg-elevated text-text-muted hover:bg-card-bg-active hover:text-text-primary"
                            }`}
                          >
                            {t(MODE_LABEL_KEYS[mode])}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {availablePalettes.map((palette) => (
                          <button
                            key={palette.id}
                            type="button"
                            onClick={() => selectPalette(palette.id)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                              currentPaletteId === palette.id
                                ? "bg-bg-elevated ring-2 ring-accent"
                                : "bg-bg hover:bg-bg-elevated"
                            }`}
                          >
                            <span
                              className="h-4 w-4 rounded-full"
                              style={{ backgroundColor: palette.preview.accent }}
                            />
                            <span className="text-xs text-text-primary">{palette.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.action === "chatSorting" && (
                    <div className="space-y-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setPrioritizePersonalUnread(!prioritizePersonalUnread)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                          prioritizePersonalUnread
                            ? "bg-accent text-on-accent"
                            : "bg-bg text-text-primary hover:bg-bg-elevated"
                        }`}
                      >
                        {t("settings.chatSortingPrioritizeDirects")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPrioritizeUnmutedUnreadChannels(!prioritizeUnmutedUnreadChannels)
                        }
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                          prioritizeUnmutedUnreadChannels
                            ? "bg-accent text-on-accent"
                            : "bg-bg text-text-primary hover:bg-bg-elevated"
                        }`}
                      >
                        {t("settings.chatSortingPrioritizeUnmuted")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
