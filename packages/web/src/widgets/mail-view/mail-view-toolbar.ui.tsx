import React from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";

export interface MailViewToolbarProps {
  searchQuery: string;
  batchMode: boolean;
  selectedCount: number;
  onSearchChange: (value: string) => void;
  onComposeOpen: () => void;
  onToggleBatchMode: () => void;
  onBatchDelete: () => void;
}

export const MailViewToolbar: React.FC<MailViewToolbarProps> = ({
  searchQuery,
  batchMode,
  selectedCount,
  onSearchChange,
  onComposeOpen,
  onToggleBatchMode,
  onBatchDelete,
}) => (
  <header
    className="relative z-sticky mb-2 flex min-h-10 min-w-0 shrink-0 flex-wrap items-center gap-2 md:mb-3"
    data-selection-mode={batchMode ? "true" : "false"}
  >
    {batchMode ? (
      <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border-subtle bg-card-bg px-2 py-1 shadow-sm">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onToggleBatchMode}
          className="shrink-0"
        >
          {t("mail.batchDone")}
        </Button>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
          role="status"
        >
          {t("mail.selectedCount", { count: selectedCount })}
        </span>
        {selectedCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onBatchDelete}
            className="shrink-0 text-notice-base hover:text-notice-base"
          >
            <Icon name="delete" size={16} />
            {t("mail.batchDelete", { count: selectedCount })}
          </Button>
        ) : null}
      </div>
    ) : (
      <>
        <h1 className="order-1 min-w-0 flex-1 truncate text-base font-semibold text-text-primary sm:flex-none md:text-lg">
          {t("nav.mail")}
        </h1>
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={t("mail.searchPlaceholder")}
          ariaLabel={t("mail.searchPlaceholder")}
          size="sm"
          clearable
          iconPosition="left"
          className="order-3 basis-full sm:order-2 sm:min-w-52 sm:max-w-xl sm:flex-1 sm:basis-auto"
        />
        <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:order-3 sm:ml-0 sm:gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onToggleBatchMode}
            className="shrink-0 px-2 sm:px-3"
          >
            {t("mail.batchSelect")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={onComposeOpen}
            className="shrink-0 gap-1.5 px-2 text-on-accent shadow-sm hover:opacity-90 sm:px-3"
            aria-label={t("mail.compose")}
          >
            <Icon name="pen" size={16} className="text-on-accent" />
            <span className="hidden sm:inline">{t("mail.compose")}</span>
          </Button>
        </div>
      </>
    )}
  </header>
);
