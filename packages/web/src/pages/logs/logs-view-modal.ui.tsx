import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import type { LogEntry } from "~/shared/lib/logger";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { LogsPageLogsSection } from "./logs-page-logs.ui";
import type { LogSourceFilter } from "./logs-source-filter.lib";

const LOGS_MODAL_CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[85vh] max-w-4xl -translate-y-1/2 flex-col overflow-hidden bg-card-bg p-0 shadow-2xl`;

export interface LogsViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly LogEntry[];
  recentErrors: readonly LogEntry[];
  levelFilter: LogEntry["level"] | "all";
  sourceFilter: LogSourceFilter;
  scopeFilter: string;
  runtimeFilter: string;
  searchQuery: string;
  hasEntries: boolean;
  onLevelFilterChange: (value: LogEntry["level"] | "all") => void;
  onSourceFilterChange: (value: LogSourceFilter) => void;
  onScopeFilterChange: (value: string) => void;
  onRuntimeFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onExport: () => void;
}

export const LogsViewModal: React.FC<LogsViewModalProps> = ({
  open,
  onOpenChange,
  entries,
  recentErrors,
  levelFilter,
  sourceFilter,
  scopeFilter,
  runtimeFilter,
  searchQuery,
  hasEntries,
  onLevelFilterChange,
  onSourceFilterChange,
  onScopeFilterChange,
  onRuntimeFilterChange,
  onSearchQueryChange,
  onResetFilters,
  onRefresh,
  onClear,
  onExport,
}) => (
  <AppDialogShell
    open={open}
    onOpenChange={onOpenChange}
    contentClassName={LOGS_MODAL_CONTENT_CLASS}
  >
    <Dialog.Description className="sr-only">{t("settings.logsHint")}</Dialog.Description>

    <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
      <div className="min-w-0">
        <Dialog.Title className="text-sm font-semibold text-text-primary">
          {t("settings.logs")}
        </Dialog.Title>
        <p className="mt-0.5 text-[11px] text-text-muted">{t("settings.logsHint")}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
        >
          {t("settings.logsRefresh")}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasEntries}
          className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("settings.logsClear")}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!hasEntries}
          className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("settings.logsDownload")}
        </button>
        <Dialog.Close asChild>
          <button
            type="button"
            className="hover:bg-bg/50 rounded p-1 text-text-muted"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </div>
    </header>

    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden p-3 pt-2 ${SCROLL_AREA_CLASS}`}>
      <LogsPageLogsSection
        entries={entries}
        recentErrors={recentErrors}
        levelFilter={levelFilter}
        sourceFilter={sourceFilter}
        scopeFilter={scopeFilter}
        runtimeFilter={runtimeFilter}
        searchQuery={searchQuery}
        showHeading={false}
        onLevelFilterChange={onLevelFilterChange}
        onSourceFilterChange={onSourceFilterChange}
        onScopeFilterChange={onScopeFilterChange}
        onRuntimeFilterChange={onRuntimeFilterChange}
        onSearchQueryChange={onSearchQueryChange}
        onResetFilters={onResetFilters}
      />
    </div>
  </AppDialogShell>
);
