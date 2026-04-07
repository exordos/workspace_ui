import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { MODE_TAB_ACTIVE, MODE_TAB_BTN, MODE_TAB_INACTIVE } from "./message-composer-styles.lib";
import type { ComposerModeTabsProps } from "./message-composer.types";

export const ComposerModeTabs = React.memo<ComposerModeTabsProps>(function ComposerModeTabs({
  mode,
  onChange,
}) {
  return (
    <div className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-card-bg p-0.5">
      <button
        type="button"
        className={`${MODE_TAB_BTN} ${mode === "write" ? MODE_TAB_ACTIVE : MODE_TAB_INACTIVE}`}
        onClick={() => onChange("write")}
        aria-label={t("composer.write")}
        title={t("composer.write")}
      >
        <Icon name="pen" size={16} className="text-current" />
      </button>
      <button
        type="button"
        className={`${MODE_TAB_BTN} ${mode === "preview" ? MODE_TAB_ACTIVE : MODE_TAB_INACTIVE}`}
        onClick={() => onChange("preview")}
        aria-label={t("composer.preview")}
        title={t("composer.preview")}
      >
        <Icon name="visibility" size={16} className="text-current" />
      </button>
    </div>
  );
});
