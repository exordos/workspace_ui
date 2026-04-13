import React, { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { InstanceSwitcher } from "~/features/instance-switch/instance-switch.ui";
import { t } from "~/i18n/i18n";
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
        className="mb-1 flex w-full items-center justify-between gap-4 rounded-b-xl border-b border-border-subtle bg-bg-elevated p-2"
        data-focus-zone="topbar"
        role="banner"
        aria-label={t("a11y.topBar")}
      >
        <div data-testid="topbar-left-slot" className="min-w-0 flex-shrink-0 pl-5">
          <InstanceSwitcher />
        </div>

        <TopBarSectionNav
          sections={sections}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        <div className="flex flex-shrink-0 items-center gap-3">
          <TopBarSearchButton onOpenSearch={openSearchModal} />
          <TopBarDownloadCenter />
          <TopBarProfileTrigger />
        </div>
      </header>
    </>
  );
};
