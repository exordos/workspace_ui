import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import type { LogEntry } from "~/shared/lib/logger";
import { Icon } from "~/shared/ui/icon";
import { matchesLogSourceFilter, type LogSourceFilter } from "./logs-source-filter.lib";

export interface LogsPageLogsSectionProps {
  entries: readonly LogEntry[];
  recentErrors: readonly LogEntry[];
  levelFilter: LogEntry["level"] | "all";
  sourceFilter: LogSourceFilter;
  scopeFilter: string;
  runtimeFilter: string;
  searchQuery: string;
  showHeading?: boolean;
  onLevelFilterChange: (value: LogEntry["level"] | "all") => void;
  onSourceFilterChange: (value: LogSourceFilter) => void;
  onScopeFilterChange: (value: string) => void;
  onRuntimeFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onResetFilters: () => void;
}

export const LogsPageLogsSection: React.FC<LogsPageLogsSectionProps> = ({
  entries,
  recentErrors,
  levelFilter,
  sourceFilter,
  scopeFilter,
  runtimeFilter,
  searchQuery,
  showHeading = true,
  onLevelFilterChange,
  onSourceFilterChange,
  onScopeFilterChange,
  onRuntimeFilterChange,
  onSearchQueryChange,
  onResetFilters,
}) => {
  const scopeOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.scope))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [entries]);

  const runtimeOptions = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.runtime))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (!matchesLogSourceFilter(entry, sourceFilter)) return false;
      if (scopeFilter !== "all" && entry.scope !== scopeFilter) return false;
      if (runtimeFilter !== "all" && entry.runtime !== runtimeFilter) return false;
      if (normalizedQuery.length === 0) return true;

      const serializedData = entry.data ? JSON.stringify(entry.data) : "";
      const searchable =
        `${entry.level} ${entry.scope} ${entry.runtime} ${entry.message} ${serializedData}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [entries, levelFilter, runtimeFilter, scopeFilter, searchQuery, sourceFilter]);

  const logsResultLabel = t("settings.logsResults", {
    visible: filteredEntries.length,
    total: entries.length,
  });
  const hasVisibleEntries = filteredEntries.length > 0;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden"
      aria-labelledby={showHeading ? "diagnostics-logs-heading" : undefined}
    >
      {showHeading && (
        <header className="shrink-0 border-b border-border-subtle pb-1.5">
          <h2 id="diagnostics-logs-heading" className="text-sm font-semibold text-text-primary">
            {t("settings.logs")}
          </h2>
          <p className="mt-0.5 text-[11px] text-text-muted">{t("settings.logsHint")}</p>
        </header>
      )}

      {recentErrors.length > 0 && (
        <details className="rounded-lg border border-border-subtle bg-card-bg p-2" open>
          <summary className="cursor-pointer text-xs font-medium text-text-primary">
            {t("settings.diagnosticsRecentErrors")}
          </summary>
          <ul className={`mt-2 max-h-40 space-y-1 overflow-auto ${SCROLL_AREA_CLASS}`}>
            {recentErrors.map((entry, index) => (
              <LogEntryRow key={`recent-${entry.timestamp}-${index}`} entry={entry} emphasize />
            ))}
          </ul>
        </details>
      )}

      <div
        className={`flex shrink-0 items-center gap-1 overflow-x-auto pb-0.5 ${SCROLL_AREA_CLASS}`}
        role="group"
        aria-label={t("settings.logsSearch")}
      >
        <label className="min-w-0">
          <span className="sr-only">{t("settings.logsSearch")}</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t("settings.logsSearchPlaceholder")}
            aria-label={t("settings.logsSearch")}
            className="h-8 min-w-context-menu-narrow rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t("settings.logsSourceFilter")}</span>
          <select
            aria-label={t("settings.logsSourceFilter")}
            value={sourceFilter}
            onChange={(event) => onSourceFilterChange(event.target.value as LogSourceFilter)}
            className="h-8 min-w-[110px] rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary"
          >
            <option value="all">{t("settings.logsSourceAll")}</option>
            <option value="api">{t("settings.logsSourceApi")}</option>
            <option value="actions">{t("settings.logsSourceActions")}</option>
            <option value="console">{t("settings.logsSourceConsole")}</option>
            <option value="trace">{t("settings.logsSourceTrace")}</option>
            <option value="app">{t("settings.logsSourceApp")}</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t("settings.logsLevelFilter")}</span>
          <select
            aria-label={t("settings.logsLevelFilter")}
            value={levelFilter}
            onChange={(event) =>
              onLevelFilterChange(event.target.value as LogEntry["level"] | "all")
            }
            className="h-8 min-w-[110px] rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary"
          >
            <option value="all">{t("settings.logsLevelAll")}</option>
            <option value="debug">{t("settings.logsLevelDebug")}</option>
            <option value="info">{t("settings.logsLevelInfo")}</option>
            <option value="warn">{t("settings.logsLevelWarn")}</option>
            <option value="error">{t("settings.logsLevelError")}</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t("settings.logsScopeFilter")}</span>
          <select
            aria-label={t("settings.logsScopeFilter")}
            value={scopeFilter}
            onChange={(event) => onScopeFilterChange(event.target.value)}
            className="h-8 min-w-[110px] rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary"
          >
            <option value="all">{t("settings.logsScopeAll")}</option>
            {scopeOptions.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t("settings.logsRuntimeFilter")}</span>
          <select
            aria-label={t("settings.logsRuntimeFilter")}
            value={runtimeFilter}
            onChange={(event) => onRuntimeFilterChange(event.target.value)}
            className="h-8 min-w-[110px] rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary"
          >
            <option value="all">{t("settings.logsRuntimeAll")}</option>
            {runtimeOptions.map((runtime) => (
              <option key={runtime} value={runtime}>
                {runtime}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onResetFilters}
          className="h-8 shrink-0 whitespace-nowrap rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
        >
          {t("settings.logsResetFilters")}
        </button>
      </div>
      <p className="shrink-0 text-[11px] text-text-muted">{logsResultLabel}</p>
      {!hasVisibleEntries ? (
        <div className="bg-card-bg/50 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle p-4 text-center text-text-muted">
          <Icon name="grid" size={32} className="opacity-50" />
          <p className="text-xs">{t("settings.logsEmpty")}</p>
        </div>
      ) : (
        <ul
          aria-label={t("settings.logsList")}
          className={`flex min-h-0 flex-1 flex-col gap-1 overflow-auto ${SCROLL_AREA_CLASS}`}
        >
          {filteredEntries.map((entry, index) => (
            <LogEntryRow key={`${entry.timestamp}-${index}`} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
};

interface LogEntryRowProps {
  entry: LogEntry;
  emphasize?: boolean;
}

const LogEntryRow: React.FC<LogEntryRowProps> = ({ entry, emphasize = false }) => {
  const serializedData = entry.data ? JSON.stringify(entry.data) : null;
  const borderClass =
    entry.level === "error"
      ? "border-l-2 border-indicator-red"
      : entry.level === "warn"
        ? "border-l-2 border-indicator-yellow"
        : emphasize
          ? "border-l-2 border-border-subtle"
          : "";

  return (
    <li className={`rounded-md border border-border-subtle p-2 ${borderClass}`}>
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-text-muted">
        <span className="rounded bg-bg px-1.5 py-0.5 font-mono uppercase">{entry.level}</span>
        <span className="rounded bg-bg px-1.5 py-0.5 font-mono">{entry.runtime}</span>
        <span className="font-medium text-text-primary">{entry.scope}</span>
        <span>{new Date(entry.timestamp).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-text-primary">{entry.message}</p>
      {serializedData && (
        <pre
          className={`mt-1 overflow-x-auto rounded bg-bg p-1.5 text-[11px] leading-snug text-text-muted ${SCROLL_AREA_CLASS}`}
        >
          {serializedData}
        </pre>
      )}
    </li>
  );
};

/** Exposes filtered count for snapshot assembly in the parent page. */
export function filterLogEntries(
  entries: readonly LogEntry[],
  levelFilter: LogEntry["level"] | "all",
  sourceFilter: LogSourceFilter,
  scopeFilter: string,
  runtimeFilter: string,
  searchQuery: string,
): LogEntry[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return entries.filter((entry) => {
    if (levelFilter !== "all" && entry.level !== levelFilter) return false;
    if (!matchesLogSourceFilter(entry, sourceFilter)) return false;
    if (scopeFilter !== "all" && entry.scope !== scopeFilter) return false;
    if (runtimeFilter !== "all" && entry.runtime !== runtimeFilter) return false;
    if (normalizedQuery.length === 0) return true;
    const serializedData = entry.data ? JSON.stringify(entry.data) : "";
    const searchable =
      `${entry.level} ${entry.scope} ${entry.runtime} ${entry.message} ${serializedData}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}
