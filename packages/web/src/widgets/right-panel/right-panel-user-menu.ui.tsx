import { Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "~/entities/theme/theme.model";
import { selectUserStatusLabel } from "~/entities/user/user-selectors.lib";
import { updateWorkspaceOwnStatus } from "~/entities/user/user-workspace-status-actions.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { removeWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { resolveWorkspacePostLogoutRoute } from "~/entities/workspace-auth/workspace-post-logout-route.lib";
import { ManageExternalProviderEntry } from "~/features/manage-external-provider/manage-external-provider-entry.ui";
import { useTranslation } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { performApplicationColdStart } from "~/shared/lib/local-reset";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { toast } from "~/shared/lib/toast/toast";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import {
  RightPanelConnectExternalAccountDialog,
  RightPanelExternalAccountsList,
} from "./right-panel-external-account.integration";
import { RightPanelUserMenuMenuButton } from "./right-panel-user-menu-buttons.ui";
import { APP_VERSION, getInstanceLabel } from "./right-panel-user-menu-constants.lib";
import { RightPanelUserMenuStatusDialog } from "./right-panel-user-menu-status-dialog.ui";
import { RightPanelUserAppearance, RightPanelUserSettings } from "./right-panel-user-settings.ui";
import type { UserStatusEmojiDisplay } from "./right-panel-user-menu-status-dialog.ui";
import type { RightPanelUserMenuProps } from "./right-panel-user-menu.types";

const log = createLogger("right-panel-user-menu");

/**
 * Flat section list — no card chrome (Figma right menu).
 * Edge-to-edge row hover needs RightDrawer `contentFlush` (nested -mx is clipped);
 * hairlines stay inset via ::before (px-4), not divide-y.
 */
const SECTION_LIST_CLASS =
  "[&>*+*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border-subtle";

const MenuChevron: React.FC<{ open?: boolean }> = ({ open = false }) => (
  <Icon
    name={open ? "chevron-up" : "chevron-right"}
    size={16}
    className="shrink-0 text-text-secondary"
  />
);

export const RightPanelUserMenu: React.FC<RightPanelUserMenuProps> = ({
  onOpenAboutDrawer,
  onOpenPersonalInfo,
  onNestedPanelChange,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const { t } = useTranslation();
  const currentWorkspaceSession = useWorkspaceAuthStore((s) => {
    const accountId = s.currentAccountId;
    return accountId != null
      ? s.sessions.find((session) => session.accountId === accountId)
      : undefined;
  });
  const getCurrentWorkspaceSession = useWorkspaceAuthStore((s) => s.getCurrentSession);
  const currentWorkspaceUser = useUsersStore((s) =>
    currentWorkspaceSession?.userUuid != null
      ? s.usersById[currentWorkspaceSession.userUuid]
      : undefined,
  );
  const currentThemeMode = useThemeStore((s) => s.mode);
  const [menuSubview, setMenuSubview] = useState<"root" | "settings" | "appearance">("root");
  const [externalAccountsOpen, setExternalAccountsOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState("");
  const [statusAwayDraft, setStatusAwayDraft] = useState(false);
  const [statusEmojiDraft, setStatusEmojiDraft] = useState<string>("");
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [externalAccountDialogOpen, setExternalAccountDialogOpen] = useState(false);
  const currentServerLabel = useMemo(
    () =>
      currentWorkspaceSession != null
        ? getInstanceLabel(
            currentWorkspaceSession.organizationOrigin,
            currentWorkspaceSession.login,
          )
        : "",
    [currentWorkspaceSession],
  );
  const currentServerAccountLabel = currentWorkspaceSession?.login ?? "";
  const currentServerIconUrl = null;
  const currentStatusSubtitle =
    selectUserStatusLabel(currentWorkspaceUser) ??
    (currentWorkspaceUser?.status === "active"
      ? t("presence.online")
      : currentWorkspaceUser?.status === "idle" || currentWorkspaceUser?.status === "do_not_disturb"
        ? t("presence.away")
        : currentWorkspaceUser?.status === "offline"
          ? t("presence.offline")
          : t("settings.statusPlaceholder"));
  const selectedStatusEmojiDisplay = useMemo<UserStatusEmojiDisplay | null>(
    () => (statusEmojiDraft ? { kind: "text", text: statusEmojiDraft } : null),
    [statusEmojiDraft],
  );
  const statusEmojiPickerTheme = useMemo(
    () => (currentThemeMode === "light" ? Theme.LIGHT : Theme.DARK),
    [currentThemeMode],
  );

  const closeDrawer = useCallback(() => {
    rightDrawer?.setOpen(false);
  }, [rightDrawer]);

  const openStatusDialog = useCallback(() => {
    if (currentWorkspaceSession == null) return;
    setStatusTextDraft(currentWorkspaceUser?.statusText?.trim() ?? "");
    setStatusAwayDraft(
      currentWorkspaceUser?.status === "idle" || currentWorkspaceUser?.status === "do_not_disturb",
    );
    setStatusEmojiDraft(currentWorkspaceUser?.statusEmoji?.trim() ?? "");
    setStatusEmojiPickerOpen(false);
    setStatusDialogOpen(true);
  }, [
    currentWorkspaceSession,
    currentWorkspaceUser?.status,
    currentWorkspaceUser?.statusEmoji,
    currentWorkspaceUser?.statusText,
  ]);

  const closeStatusDialog = useCallback(() => {
    if (statusSubmitting) {
      return;
    }
    setStatusEmojiPickerOpen(false);
    setStatusDialogOpen(false);
  }, [statusSubmitting]);

  const clearStatusDraft = useCallback(() => {
    setStatusTextDraft("");
    setStatusAwayDraft(false);
    setStatusEmojiDraft("");
    setStatusEmojiPickerOpen(false);
  }, []);

  const toggleStatusEmojiPicker = useCallback(() => {
    setStatusEmojiPickerOpen((prevOpen) => !prevOpen);
  }, []);

  const handleSaveStatus = useCallback(async () => {
    if (currentWorkspaceSession == null) {
      toast.error(t("settings.statusUpdateError"));
      return;
    }
    setStatusSubmitting(true);
    try {
      const result = await updateWorkspaceOwnStatus({
        runtimeContext: currentWorkspaceSession,
        statusText: statusTextDraft,
        statusEmoji: statusEmojiDraft,
        away: statusAwayDraft,
      });
      if (!result.ok) {
        toast.error(t("settings.statusUpdateError"));
        return;
      }
      setStatusDialogOpen(false);
    } finally {
      setStatusSubmitting(false);
    }
  }, [currentWorkspaceSession, statusAwayDraft, statusEmojiDraft, statusTextDraft, t]);

  const openPersonalInfo = useCallback(() => {
    if (onOpenPersonalInfo != null) {
      onOpenPersonalInfo();
      return;
    }
  }, [onOpenPersonalInfo]);

  const openDiagnostics = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/logs"));
  }, [navigate]);

  const openAbout = useCallback(() => {
    onOpenAboutDrawer?.();
  }, [onOpenAboutDrawer]);

  const returnToRoot = useCallback(() => {
    setMenuSubview("root");
    onNestedPanelChange?.(null);
  }, [onNestedPanelChange]);
  const openSettings = useCallback(() => {
    setMenuSubview("settings");
    onNestedPanelChange?.({ titleKey: "settings.settings", onBack: returnToRoot });
  }, [onNestedPanelChange, returnToRoot]);
  const openAppearance = useCallback(() => {
    setMenuSubview("appearance");
    onNestedPanelChange?.({ titleKey: "settings.appearance", onBack: returnToRoot });
  }, [onNestedPanelChange, returnToRoot]);

  const handleClearCache = useCallback(async () => {
    const confirmed = window.confirm(t("settings.clearCacheConfirm"));
    if (!confirmed) return;

    log.info("Clearing application cache from unified account/settings sidebar");
    try {
      await performApplicationColdStart();
    } catch (err) {
      log.warn("Application cold-start reset failed", { error: String(err) });
    }
    window.location.reload();
  }, [t]);

  const handleLogoutFromCurrentOrg = useCallback(async () => {
    if (currentWorkspaceSession == null) return;
    const confirmed = window.confirm(
      t("auth.logoutFromOrgConfirm", { server: currentServerLabel }),
    );
    if (!confirmed) return;
    await removeWorkspaceSession(currentWorkspaceSession.accountId);
    void navigate(resolveWorkspacePostLogoutRoute(getCurrentWorkspaceSession()), { replace: true });
    closeDrawer();
  }, [
    closeDrawer,
    currentServerLabel,
    currentWorkspaceSession,
    getCurrentWorkspaceSession,
    navigate,
    t,
  ]);

  const handleStatusEmojiPick = useCallback((data: EmojiClickData) => {
    const emoji = data.emoji.trim();
    if (emoji.length === 0) {
      log.warn("Status emoji picker returned an empty emoji");
      return;
    }
    setStatusEmojiDraft(emoji.slice(0, 64));
    setStatusEmojiPickerOpen(false);
  }, []);

  if (menuSubview === "settings") {
    return (
      <RightPanelUserSettings onBack={returnToRoot} onClose={closeDrawer} showHeader={false} />
    );
  }

  if (menuSubview === "appearance") {
    return (
      <RightPanelUserAppearance onBack={returnToRoot} onClose={closeDrawer} showHeader={false} />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      {/* Shell contentFlush cancels drawer px-2; rows own px-4 so hover reaches panel edges. */}
      <ScrollArea className="flex-1 py-5">
        <div className="space-y-5">
          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.sectionDescription")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              {currentWorkspaceSession != null && (
                <div
                  data-testid="user-menu-current-server-item"
                  className="flex w-full items-center justify-between gap-2 px-4 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary">
                      {currentServerIconUrl != null ? (
                        <img
                          src={currentServerIconUrl}
                          alt=""
                          className="h-5 w-5 rounded object-contain"
                        />
                      ) : (
                        <Icon name="dashboard_customize" size={22} className="text-current" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5 text-text-primary">
                        {t("auth.currentServer")}
                      </span>
                      <span className="mt-0.5 block truncate text-sm leading-5 text-text-muted">
                        {currentServerLabel}
                      </span>
                      <span className="block truncate text-sm leading-5 text-text-muted">
                        {currentServerAccountLabel}
                      </span>
                    </span>
                  </span>
                </div>
              )}
              {currentWorkspaceSession != null && (
                <>
                  <RightPanelUserMenuMenuButton
                    label={t("externalAccounts.title")}
                    // Same chain as `links`; compact viewBox so weight matches sibling menu icons
                    icon="links_compact"
                    onClick={() => setExternalAccountsOpen((open) => !open)}
                    right={<MenuChevron open={externalAccountsOpen} />}
                  />
                  {externalAccountsOpen && (
                    <div
                      className="space-y-3 py-3 pl-4 pr-2"
                      data-testid="user-menu-external-accounts"
                    >
                      <RightPanelExternalAccountsList
                        onConnect={() => setExternalAccountDialogOpen(true)}
                      />
                      <ManageExternalProviderEntry runtimeContext={currentWorkspaceSession} />
                    </div>
                  )}
                </>
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.personalInfo")}
                icon="accountCircle"
                onClick={openPersonalInfo}
                right={<MenuChevron />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.status")}
                icon="sentiment_satisfied"
                subtitle={currentStatusSubtitle}
                onClick={openStatusDialog}
                disabled={currentWorkspaceSession == null}
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.settings")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              <RightPanelUserMenuMenuButton
                label={t("settings.settings")}
                icon="settings"
                subtitle={`${t("settings.notificationSound")}, ${t("settings.language")}, ${t("settings.authIdleTimeout")}`}
                onClick={openSettings}
                right={<MenuChevron />}
                testId="user-menu-settings-row"
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.appearance")}
                icon="draw"
                subtitle={`${t("settings.themeSettings")}, ${t("settings.folderLayout")}, ${t("settings.chatListDensity")}`}
                onClick={openAppearance}
                right={<MenuChevron />}
                testId="user-menu-appearance-row"
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.appVersion")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              <RightPanelUserMenuMenuButton
                label={t("settings.appVersion")}
                icon="info"
                onClick={openAbout}
                right={
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <span>{APP_VERSION}</span>
                    <MenuChevron />
                  </span>
                }
              />
              {IS_CONNECTION_DIAGNOSTICS_ENABLED && (
                <RightPanelUserMenuMenuButton
                  label={t("settings.connectionDiagnostics")}
                  icon="lab_profile"
                  onClick={openDiagnostics}
                  right={<MenuChevron />}
                />
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.clearCache")}
                icon="delete"
                subtitle={t("settings.clearCacheHint")}
                onClick={handleClearCache}
                right={<MenuChevron />}
              />
              {currentWorkspaceSession != null && (
                <RightPanelUserMenuMenuButton
                  label={t("auth.logout")}
                  // Same glyph as `logout`; compact crop matches sibling menu optical size
                  icon="logout_compact"
                  tone="danger"
                  onClick={handleLogoutFromCurrentOrg}
                  testId="user-menu-logout-button"
                  ariaLabel={t("auth.logoutFromOrg")}
                />
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      <RightPanelUserMenuStatusDialog
        open={statusDialogOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setStatusDialogOpen(true);
            return;
          }
          closeStatusDialog();
        }}
        closeStatusDialog={closeStatusDialog}
        statusEmojiPickerOpen={statusEmojiPickerOpen}
        onStatusEmojiPickerToggle={toggleStatusEmojiPicker}
        setStatusEmojiPickerOpen={setStatusEmojiPickerOpen}
        statusEmojiDraft={statusEmojiDraft}
        setStatusEmojiDraft={setStatusEmojiDraft}
        statusTextDraft={statusTextDraft}
        setStatusTextDraft={setStatusTextDraft}
        statusAwayDraft={statusAwayDraft}
        setStatusAwayDraft={setStatusAwayDraft}
        statusSubmitting={statusSubmitting}
        selectedStatusEmojiDisplay={selectedStatusEmojiDisplay}
        statusEmojiPickerTheme={statusEmojiPickerTheme}
        t={t}
        handleStatusEmojiPick={handleStatusEmojiPick}
        clearStatusDraft={clearStatusDraft}
        handleSaveStatus={handleSaveStatus}
      />
      <RightPanelConnectExternalAccountDialog
        open={externalAccountDialogOpen}
        onOpenChange={setExternalAccountDialogOpen}
      />
    </div>
  );
};
