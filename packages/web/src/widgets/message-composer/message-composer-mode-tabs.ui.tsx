import React from "react";
import { t } from "~/i18n/i18n";
import VisibilitySvg from "~/shared/assets/icons/composer-visibility.svg?react";
import { MODE_TAB_ACTIVE, MODE_TAB_BTN, MODE_TAB_INACTIVE } from "./message-composer-styles.lib";
import type { ComposerModeTabsProps } from "./message-composer.types";

export const ComposerModeTabs = React.memo<ComposerModeTabsProps>(function ComposerModeTabs({
  mode,
  onChange,
  showPreviewTab = true,
}) {
  if (!showPreviewTab) return null;

  return (
    <button
      type="button"
      className={`${MODE_TAB_BTN} ${mode === "preview" ? MODE_TAB_ACTIVE : MODE_TAB_INACTIVE}`}
      onClick={() => onChange(mode === "preview" ? "write" : "preview")}
      aria-label={mode === "preview" ? t("composer.write") : t("composer.preview")}
      title={mode === "preview" ? t("composer.write") : t("composer.preview")}
    >
      <VisibilitySvg
        width={25.834}
        height={17.333}
        className="text-current"
        data-composer-icon="visibility"
        aria-hidden
      />
    </button>
  );
});
