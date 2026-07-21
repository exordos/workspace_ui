import React, { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { isElectronDarwin } from "~/shared/lib/electron";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { env } from "~/shared/lib/env";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { isWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { SearchModal } from "~/widgets/search-modal/search-modal.ui";
import { TopBarDownloadCenter } from "./top-bar-download-center.ui";
import { TopBarNotificationDev } from "./top-bar-notification-dev.ui";
import { TopBarProfileTrigger } from "./top-bar-profile-trigger.ui";
import { TopBarSearchButton } from "./top-bar-search-button.ui";
import { useTopBarSearchModal } from "./top-bar-search-modal.hook";
import { TopBarSectionNav } from "./top-bar-section-nav.ui";
import { InstanceSwitcher } from "./top-bar-workspace-session-switcher.ui";
import {
  getSectionFromPathname,
  getTopBarSectionNavItems,
  resolveTopBarActiveSection,
} from "./top-bar.lib";
import type { TopBarSection } from "./top-bar.types";

export const TopBar: React.FC = () => {
  const macElectronChrome = isElectronDarwin();
  const location = useLocation();
  const navigate = useNavigate();
  const openSearchModal = useSearchModalStore((s) => s.openModal);
  const searchModalMode = isWorkspaceMessengerRoute(location.pathname) ? "workspace" : "zulip";
  const {
    open: searchOpen,
    setOpen: setSearchOpen,
    onSelectUserUuid: handleSearchSelectUserUuid,
  } = useTopBarSearchModal({ navigate, mode: searchModalMode, pathname: location.pathname });
  const workspaceSessions = useWorkspaceAuthStore((s) => s.sessions);
  const currentWorkspaceAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const currentWorkspaceRuntimeContext = useMemo(
    () =>
      selectCurrentWorkspaceRuntimeContext({
        sessions: workspaceSessions,
        currentAccountId: currentWorkspaceAccountId,
      }),
    [currentWorkspaceAccountId, workspaceSessions],
  );
  const currentWorkspaceInstanceId = currentWorkspaceRuntimeContext?.instanceId ?? null;
  const currentWorkspaceProjectId = currentWorkspaceRuntimeContext?.projectId ?? null;
  const sections = useMemo(
    () =>
      getTopBarSectionNavItems({
        showCallsNav: env.TOP_BAR_CALLS_NAV,
        showServicesNav: env.TOP_BAR_SERVICES_NAV,
      }),
    [],
  );
  const visibleSectionIds = useMemo(() => new Set(sections.map((item) => item.id)), [sections]);
  const activeSection = useMemo(() => {
    const fromPath = getSectionFromPathname(location.pathname);
    return resolveTopBarActiveSection(fromPath, visibleSectionIds);
  }, [location.pathname, visibleSectionIds]);

  const handleSectionChange = useCallback(
    (section: TopBarSection) => {
      if (section === "chat") {
        const messengerPath =
          currentWorkspaceProjectId != null && currentWorkspaceProjectId.trim().length > 0
            ? resolveMessengerNavigationPath({
                instanceId: currentWorkspaceInstanceId,
                projectId: currentWorkspaceProjectId,
              })
            : "/";
        void navigate(withCurrentOrgRoute(messengerPath));
      } else {
        void navigate(withCurrentOrgRoute(`/${section}`));
      }
    },
    [currentWorkspaceInstanceId, currentWorkspaceProjectId, navigate],
  );

  return (
    <>
      <SearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectUserUuid={handleSearchSelectUserUuid}
        mode={searchModalMode}
      />
      <header
        className="mb-1 flex w-full flex-col rounded-b-lg border-b border-border-subtle bg-bg-elevated"
        data-focus-zone="topbar"
        role="banner"
        aria-label={t("a11y.topBar")}
      >
        {macElectronChrome ? (
          <div
            data-testid="topbar-mac-titlebar-strip"
            className={`electron-drag shrink-0 ${ELECTRON_MAC_TITLEBAR_STRIP_CLASS}`}
            aria-hidden
          />
        ) : null}
        <div
          data-testid="topbar-toolbar-row"
          className="flex w-full min-w-0 items-center justify-between gap-4 p-2"
        >
          <div data-testid="topbar-left-slot" className="electron-no-drag min-w-0 pl-5">
            <div
              className={`min-w-0 max-w-xs overflow-x-auto ${SCROLL_AREA_CLASS}`}
              data-testid="topbar-instance-switcher-scroll"
            >
              {/* Vertical padding keeps org unread dots inside the scrollport (overflow-x clips Y). */}
              <div className="py-1 pr-0.5">
                <InstanceSwitcher />
              </div>
            </div>
          </div>

          <TopBarSectionNav
            sections={sections}
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            className={macElectronChrome ? "electron-no-drag" : undefined}
          />

          <div className="electron-no-drag flex flex-shrink-0 items-center gap-3">
            <TopBarNotificationDev />
            <TopBarSearchButton onOpenSearch={openSearchModal} />
            <TopBarDownloadCenter />
            <TopBarProfileTrigger />
          </div>
        </div>
      </header>
    </>
  );
};
