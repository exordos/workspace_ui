import React, { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { InstanceSwitcher } from "~/features/instance-switch/instance-switch.ui";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { isElectronDarwin } from "~/shared/lib/electron";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { env } from "~/shared/lib/env";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { SearchModal } from "~/widgets/search-modal/search-modal.ui";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";
import { TopBarDownloadCenter } from "./top-bar-download-center.ui";
import { TopBarProfileTrigger } from "./top-bar-profile-trigger.ui";
import { TopBarSearchButton } from "./top-bar-search-button.ui";
import { useTopBarSearchModal } from "./top-bar-search-modal.hook";
import { TopBarSectionNav } from "./top-bar-section-nav.ui";
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
  const {
    open: searchOpen,
    setOpen: setSearchOpen,
    onSelectMessage: handleSearchSelectMessage,
    onSelectUser: handleSearchSelectUser,
  } = useTopBarSearchModal({ navigate });
  const streamsFromStore = useChatListStore((s) => s.streams());
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
        const first = streamsFromStore[0];
        void navigate(
          first ? withCurrentOrgRoute(`/stream/${slugForStream(first)}`) : withCurrentOrgRoute("/"),
        );
      } else {
        void navigate(withCurrentOrgRoute(`/${section}`));
      }
    },
    [streamsFromStore, navigate],
  );

  return (
    <>
      <SearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectMessage={handleSearchSelectMessage}
        onSelectUser={handleSearchSelectUser}
      />
      <header
        className="mb-1 flex w-full flex-col rounded-b-xl border-b border-border-subtle bg-bg-elevated"
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
          className="flex min-w-0 w-full items-center justify-between gap-4 p-2"
        >
          <div data-testid="topbar-left-slot" className="electron-no-drag min-w-0 pl-5">
            <div
              className={`max-w-xs min-w-0 overflow-x-auto ${SCROLL_AREA_CLASS}`}
              data-testid="topbar-instance-switcher-scroll"
            >
              <InstanceSwitcher />
            </div>
          </div>

          <TopBarSectionNav
            sections={sections}
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            className={macElectronChrome ? "electron-no-drag" : undefined}
          />

          <div className="electron-no-drag flex flex-shrink-0 items-center gap-3">
            <TopBarSearchButton onOpenSearch={openSearchModal} />
            <TopBarDownloadCenter />
            <TopBarProfileTrigger />
          </div>
        </div>
      </header>
    </>
  );
};
