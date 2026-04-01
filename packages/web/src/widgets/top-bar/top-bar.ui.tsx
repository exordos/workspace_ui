import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import { TopBarDownloadCenter } from "./top-bar-download-center.ui";
import { getTopBarSectionNavItems } from "./top-bar.lib";
import { TopBarProfileTrigger } from "./top-bar-profile-trigger.ui";
import { TopBarSearchButton } from "./top-bar-search-button.ui";
import { TopBarSectionNav } from "./top-bar-section-nav.ui";
import type { TopBarProps } from "./top-bar.types";

export const TopBar: React.FC<TopBarProps> = ({ activeSection, onSectionChange, leftContent }) => {
  const openSearchModal = useSearchModalStore((s) => s.openModal);

  const sections = useMemo(() => getTopBarSectionNavItems(), []);

  return (
    <header
      className="mb-1 flex w-full items-center justify-between gap-4 rounded-b-xl border-b border-border-subtle bg-bg-elevated p-2"
      data-focus-zone="topbar"
      role="banner"
      aria-label={t("a11y.topBar")}
    >
      <div
        data-testid="topbar-left-slot"
        className={leftContent != null ? "min-w-0 flex-shrink-0 pl-5" : "min-w-0 flex-shrink-0"}
      >
        {leftContent}
      </div>

      <TopBarSectionNav
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />

      <div className="flex flex-shrink-0 items-center gap-3">
        <TopBarSearchButton onOpenSearch={openSearchModal} />
        <TopBarDownloadCenter />
        <TopBarProfileTrigger />
      </div>
    </header>
  );
};
