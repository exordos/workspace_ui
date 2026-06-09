import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { authIdleTimeoutToMs } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { getSessionRemainingMs } from "~/shared/lib/auth-guard";
import { writeText } from "~/shared/lib/clipboard";
import {
  getConnectionHealthSnapshot,
  subscribeConnectionHealth,
} from "~/shared/lib/connection-health";
import type { DiagnosticIdbSnapshot } from "~/shared/lib/diagnostics-idb.lib";
import { estimateDiagnosticsIdbFootprint } from "~/shared/lib/diagnostics-idb.lib";
import type { DiagnosticsMemorySnapshot } from "~/shared/lib/diagnostics-memory.lib";
import { getDiagnosticRealtimeStats } from "~/shared/lib/diagnostics-realtime.lib";
import { getDiagnosticVitalsSnapshot } from "~/shared/lib/diagnostics-vitals.lib";
import {
  clearLogHistory,
  getLogHistory,
  subscribeLogHistory,
  type LogEntry,
} from "~/shared/lib/logger";
import { probeApiTransportWithLatency } from "~/shared/lib/network-transport-probe.lib";
import { pushService } from "~/shared/lib/push/push.service";
import { getZulipRateLimitBlockedUntil } from "~/shared/lib/zulip-rate-limit-gate";
import {
  buildConnectionReportSnapshot,
  collectDiagnosticsPageSnapshot,
} from "./diagnostics-collect.lib";
import { downloadLogsAsFile } from "./logs-export.lib";
import { filterLogEntries } from "./logs-page-logs.ui";
import { LogsPageMemorySection } from "./logs-page-memory.ui";
import { LogsPageOverview } from "./logs-page-overview.ui";
import { LogsViewModal } from "./logs-view-modal.ui";
import type { LogSourceFilter } from "./logs-source-filter.lib";

export const LogsPage: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<readonly LogEntry[]>(() => [...getLogHistory()].reverse());
  const [levelFilter, setLevelFilter] = useState<LogEntry["level"] | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LogSourceFilter>("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [runtimeFilter, setRuntimeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [memorySnapshot, setMemorySnapshot] = useState<DiagnosticsMemorySnapshot | null>(null);
  const [memoryRefreshToken, setMemoryRefreshToken] = useState(0);
  const [connectionHealth, setConnectionHealth] = useState(getConnectionHealthSnapshot);
  const [cacheSnapshot, setCacheSnapshot] = useState<DiagnosticIdbSnapshot | null>(null);
  const [pingState, setPingState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [dashboardTick, setDashboardTick] = useState(0);
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamsCount = useChatListStore((s) => s.streams().length);
  const dmsCount = useChatListStore((s) => s.dms().length);
  const usersCount = useUsersStore((s) => s.users.size);
  const currentChatMessagesCount = useCurrentChatMessagesStore((s) => s.messages.length);
  const currentInstance = useInstancesStore((s) => s.getCurrentInstance());
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const instancesCount = useInstancesStore((s) => s.instances.length);
  const unreadCountsByInstance = useInstancesStore((s) => s.unreadCountsByInstance);
  const themeMode = useThemeStore((s) => s.mode);
  const themePalette = useThemeStore((s) => s.paletteId);
  const settingsLanguage = useSettingsStore((s) => s.language);
  const notificationSound = useSettingsStore((s) => s.notificationSound);
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const authIdleTimeout = useSettingsStore((s) => s.authIdleTimeout);

  const refreshLogs = useCallback(() => {
    setEntries([...getLogHistory()].reverse());
    setMemoryRefreshToken((token) => token + 1);
    setConnectionHealth(getConnectionHealthSnapshot());
    setDashboardTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    return subscribeLogHistory(refreshLogs);
  }, [refreshLogs]);

  useEffect(() => {
    return subscribeConnectionHealth(() => {
      setConnectionHealth(getConnectionHealthSnapshot());
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void estimateDiagnosticsIdbFootprint(currentInstanceId).then((snapshot) => {
      if (!cancelled) setCacheSnapshot(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, dashboardTick]);

  const clearLogs = useCallback(() => {
    clearLogHistory();
    refreshLogs();
  }, [refreshLogs]);

  const exportLogs = useCallback(() => {
    downloadLogsAsFile(entries);
  }, [entries]);

  const hasEntries = entries.length > 0;

  const filteredCount = useMemo(
    () =>
      filterLogEntries(entries, levelFilter, sourceFilter, scopeFilter, runtimeFilter, searchQuery)
        .length,
    [entries, levelFilter, runtimeFilter, scopeFilter, searchQuery, sourceFilter],
  );

  const diagnosticsSnapshot = useMemo(
    () =>
      collectDiagnosticsPageSnapshot({
        pathname: location.pathname,
        entries,
        filteredCount,
        connection: connectionHealth,
        rateLimitBlockedUntil: getZulipRateLimitBlockedUntil(),
        memorySnapshot,
        pushState: pushService.getState(),
        vitals: getDiagnosticVitalsSnapshot(),
        cache: cacheSnapshot,
        realtimeStats: getDiagnosticRealtimeStats(),
        sessionRemainingMs: getSessionRemainingMs(),
        authIdleTimeoutMs: authIdleTimeoutToMs(authIdleTimeout),
        currentUserId,
        streamsCount,
        dmsCount,
        usersCount,
        currentChatMessagesCount,
        currentInstanceId,
        currentRealm: currentInstance?.realm ?? null,
        currentEmail: currentInstance?.email ?? null,
        instancesCount,
        unreadCountsByInstance,
        settingsLanguage,
        themeMode,
        themePalette,
        prioritizePersonalUnread,
        prioritizeUnmutedUnreadChannels,
        notificationSound,
        folderRailLayout,
      }),
    [
      authIdleTimeout,
      cacheSnapshot,
      connectionHealth,
      currentChatMessagesCount,
      currentInstance?.email,
      currentInstance?.realm,
      currentInstanceId,
      currentUserId,
      dmsCount,
      entries,
      filteredCount,
      folderRailLayout,
      instancesCount,
      location.pathname,
      memorySnapshot,
      notificationSound,
      prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels,
      settingsLanguage,
      streamsCount,
      themeMode,
      themePalette,
      unreadCountsByInstance,
      usersCount,
    ],
  );

  const diagnosticsSnapshotJson = useMemo(
    () => JSON.stringify(diagnosticsSnapshot, null, 2),
    [diagnosticsSnapshot],
  );

  const handleCopySnapshot = useCallback(() => {
    void writeText(diagnosticsSnapshotJson).then((ok) => {
      setCopyState(ok ? "success" : "error");
    });
  }, [diagnosticsSnapshotJson]);

  const handleCopyConnectionReport = useCallback(() => {
    const report = JSON.stringify(buildConnectionReportSnapshot(diagnosticsSnapshot), null, 2);
    void writeText(report).then((ok) => {
      setCopyState(ok ? "success" : "error");
    });
  }, [diagnosticsSnapshot]);

  const handlePingServer = useCallback(() => {
    setPingState("loading");
    void probeApiTransportWithLatency()
      .then((result) => {
        setPingLatencyMs(result.latencyMs);
        setPingState(result.ok ? "success" : "error");
      })
      .catch(() => {
        setPingState("error");
        setPingLatencyMs(null);
      });
  }, []);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (pingState === "idle" || pingState === "loading") return;
    const timer = window.setTimeout(() => setPingState("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [pingState]);

  const copySnapshotLabel = useMemo(() => {
    if (copyState === "success") return t("settings.diagnosticsCopySuccess");
    if (copyState === "error") return t("settings.diagnosticsCopyError");
    return t("settings.diagnosticsCopySnapshot");
  }, [copyState]);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setLevelFilter("all");
    setSourceFilter("all");
    setScopeFilter("all");
    setRuntimeFilter("all");
  }, []);

  const openLogsModal = useCallback(() => {
    setLogsModalOpen(true);
  }, []);

  const handleLogsModalOpenChange = useCallback((open: boolean) => {
    setLogsModalOpen(open);
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border-subtle bg-card-bg px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text-primary">
              {t("settings.connectionDiagnostics")}
            </h1>
            <p className="mt-0.5 text-xs text-text-muted">{t("settings.diagnosticsHint")}</p>
          </div>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={openLogsModal}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {t("settings.logsViewModal")}
            </button>
            <button
              type="button"
              onClick={refreshLogs}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {t("settings.logsRefresh")}
            </button>
            <button
              type="button"
              onClick={handleCopyConnectionReport}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {t("settings.diagnosticsCopyConnectionReport")}
            </button>
            <button
              type="button"
              onClick={handleCopySnapshot}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {copySnapshotLabel}
            </button>
          </div>
        </div>
      </header>

      <div className={`flex min-h-0 flex-1 flex-col overflow-auto p-2 ${SCROLL_AREA_CLASS}`}>
        <div className="flex flex-col gap-2">
          <LogsPageMemorySection
            memorySnapshot={memorySnapshot}
            onSnapshotChange={setMemorySnapshot}
            refreshToken={memoryRefreshToken}
          />

          <LogsPageOverview
            snapshot={diagnosticsSnapshot}
            pingState={pingState}
            pingLatencyMs={pingLatencyMs}
            onPingServer={handlePingServer}
            onOpenLogs={openLogsModal}
          />

          <details className="rounded-lg border border-border-subtle bg-card-bg p-2">
            <summary className="cursor-pointer text-xs font-medium text-text-primary">
              {t("settings.diagnosticsAdvancedSnapshot")}
            </summary>
            <pre
              className={`mt-2 max-h-52 overflow-auto rounded bg-bg p-1.5 text-[11px] leading-snug text-text-muted ${SCROLL_AREA_CLASS}`}
            >
              {diagnosticsSnapshotJson}
            </pre>
          </details>
        </div>
      </div>

      <LogsViewModal
        open={logsModalOpen}
        onOpenChange={handleLogsModalOpenChange}
        entries={entries}
        recentErrors={diagnosticsSnapshot.logs.recentErrors}
        levelFilter={levelFilter}
        sourceFilter={sourceFilter}
        scopeFilter={scopeFilter}
        runtimeFilter={runtimeFilter}
        searchQuery={searchQuery}
        hasEntries={hasEntries}
        onLevelFilterChange={setLevelFilter}
        onSourceFilterChange={setSourceFilter}
        onScopeFilterChange={setScopeFilter}
        onRuntimeFilterChange={setRuntimeFilter}
        onSearchQueryChange={setSearchQuery}
        onResetFilters={resetFilters}
        onRefresh={refreshLogs}
        onClear={clearLogs}
        onExport={exportLogs}
      />
    </div>
  );
};
