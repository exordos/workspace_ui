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
        className={[
          "flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 pl-2",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={`flex min-w-0 items-center gap-2 overflow-x-auto ${SCROLL_AREA_CLASS}`}>
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
