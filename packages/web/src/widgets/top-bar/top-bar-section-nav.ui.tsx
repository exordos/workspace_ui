import React, { useCallback } from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { TopBarSectionButton } from "./top-bar-section-button.ui";
import type { TopBarSectionNavProps, TopBarSection } from "./top-bar.types";

export const TopBarSectionNav = React.memo<TopBarSectionNavProps>(
  ({ sections, activeSection, onSectionChange, className }) => {
    const handleSelect = useCallback(
      (id: TopBarSection) => {
        onSectionChange(id);
      },
      [onSectionChange],
    );

    return (
      <div
        data-testid="topbar-sections-slot"
        className={["flex min-w-0 flex-col items-center justify-center gap-1.5", className]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Do not use justify-center here: overflow-x-auto would clip the first buttons. */}
        {/* 12px (`gap-3`): one step tighter than Figma `tabbar` M (16px). */}
        <div className={`flex min-w-0 items-center gap-3 overflow-x-auto ${SCROLL_AREA_CLASS}`}>
          {sections.map(({ id, icon, label, available }) => (
            <TopBarSectionButton
              key={id}
              id={id}
              icon={icon}
              label={label}
              available={available}
              isActive={activeSection === id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    );
  },
);

TopBarSectionNav.displayName = "TopBarSectionNav";
