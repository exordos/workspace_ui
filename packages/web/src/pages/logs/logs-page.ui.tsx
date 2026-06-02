import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { writeText } from "~/shared/lib/clipboard";
import { isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import {
  clearLogHistory,
  getLogHistory,
  subscribeLogHistory,
  type LogEntry,
} from "~/shared/lib/logger";
import { isOnline } from "~/shared/lib/network";
import { getIdleTimeMs, getLocalPresenceStatus } from "~/shared/lib/presence";
import { getRuntime, isPwa } from "~/shared/lib/pwa";
import { isTabVisible } from "~/shared/lib/visibility";
import { getWebViewPlatform, isWebView } from "~/shared/lib/webview";
import { Icon } from "~/shared/ui/icon";
import { downloadLogsAsFile } from "./logs-export.lib";
import { matchesLogSourceFilter, type LogSourceFilter } from "./logs-source-filter.lib";

export const LogsPage: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<readonly LogEntry[]>(() => [...getLogHistory()].reverse());
  const [levelFilter, setLevelFilter] = useState<LogEntry["level"] | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LogSourceFilter>("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [runtimeFilter, setRuntimeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

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

  const refreshLogs = useCallback(() => {
    setEntries([...getLogHistory()].reverse());
  }, []);

  useEffect(() => {
    return subscribeLogHistory(refreshLogs);
  }, [refreshLogs]);

  const clearLogs = useCallback(() => {
    clearLogHistory();
    refreshLogs();
  }, [refreshLogs]);

  const exportLogs = useCallback(() => {
    downloadLogsAsFile(entries);
  }, [entries]);

  const hasEntries = entries.length > 0;

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
  }, [entries, levelFilter, sourceFilter, runtimeFilter, scopeFilter, searchQuery]);

  const diagnosticsSnapshot = useMemo(() => {
    const hasWindow = typeof window !== "undefined";
    const hasNavigator = typeof navigator !== "undefined";
    const serviceWorkerController =
      hasNavigator && "serviceWorker" in navigator
        ? (navigator.serviceWorker.controller?.scriptURL ?? null)
        : null;

    const logsByLevel = entries.reduce(
      (acc, entry) => {
        acc[entry.level] += 1;
        return acc;
      },
      { debug: 0, info: 0, warn: 0, error: 0 },
    );

    return {
      collectedAt: new Date().toISOString(),
      runtime: {
        mode: env.MODE,
        detectedRuntime: getRuntime(),
        isElectron: isElectron(),
        isPwa: isPwa(),
        isWebView: isWebView(),
        webViewPlatform: getWebViewPlatform(),
        online: isOnline(),
        tabVisible: isTabVisible(),
        localPresence: getLocalPresenceStatus(),
        idleTimeMs: getIdleTimeMs(),
        notificationPermission:
          typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        serviceWorkerController,
        path: location.pathname,
        href: hasWindow ? window.location.href : "",
        viewport: hasWindow
          ? {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio,
            }
          : null,
        screen: hasWindow
          ? {
              width: window.screen?.width ?? null,
              height: window.screen?.height ?? null,
              availWidth: window.screen?.availWidth ?? null,
              availHeight: window.screen?.availHeight ?? null,
            }
          : null,
        userAgent: hasNavigator ? navigator.userAgent : "",
        language: hasNavigator ? navigator.language : "",
        languages: hasNavigator ? [...navigator.languages] : [],
      },
      environment: {
        appVersion: import.meta.env.VITE_APP_VERSION ?? "dev",
        workspaceApiOrigin: env.WORKSPACE_API_ORIGIN,
        workspaceApiBase: env.WORKSPACE_API_BASE,
        workspaceUploadsOrigin: env.WORKSPACE_UPLOADS_ORIGIN,
        jitsiDomain: env.JITSI_MEET_DOMAIN,
        baseUrl: env.BASE_URL,
        cdnUrl: env.CDN_URL,
      },
      session: {
        currentUserId,
        locale: settingsLanguage,
        themeMode,
        themePalette,
        prioritizePersonalUnread,
        prioritizeUnmutedUnreadChannels,
        notificationSound,
        folderRailLayout,
      },
      stores: {
        streamsCount,
        dmsCount,
        usersCount,
        currentChatMessagesCount,
      },
      instances: {
        count: instancesCount,
        currentInstanceId,
        currentRealm: currentInstance?.realm ?? null,
        currentEmail: currentInstance?.email ?? null,
        unreadCountsByInstance,
      },
      logs: {
        total: entries.length,
        filtered: filteredEntries.length,
        byLevel: logsByLevel,
        scopes: scopeOptions,
        runtimes: runtimeOptions,
      },
    };
  }, [
    currentChatMessagesCount,
    currentInstance?.email,
    currentInstance?.realm,
    currentInstanceId,
    currentUserId,
    dmsCount,
    entries,
    filteredEntries.length,
    folderRailLayout,
    instancesCount,
    location.pathname,
    notificationSound,
    prioritizePersonalUnread,
    prioritizeUnmutedUnreadChannels,
    runtimeOptions,
    scopeOptions,
    settingsLanguage,
    streamsCount,
    themeMode,
    themePalette,
    unreadCountsByInstance,
    usersCount,
  ]);

  const diagnosticsSnapshotJson = useMemo(
    () => JSON.stringify(diagnosticsSnapshot, null, 2),
    [diagnosticsSnapshot],
  );

  const handleCopySnapshot = useCallback(() => {
    void writeText(diagnosticsSnapshotJson).then((ok) => {
      setCopyState(ok ? "success" : "error");
    });
  }, [diagnosticsSnapshotJson]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copySnapshotLabel = useMemo(() => {
    if (copyState === "success") return t("settings.diagnosticsCopySuccess");
    if (copyState === "error") return t("settings.diagnosticsCopyError");
    return t("settings.diagnosticsCopySnapshot");
  }, [copyState]);

  const logsResultLabel = useMemo(
    () =>
      t("settings.logsResults", {
        visible: filteredEntries.length,
        total: entries.length,
      }),
    [entries.length, filteredEntries.length],
  );
  const hasVisibleEntries = filteredEntries.length > 0;

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
              onClick={refreshLogs}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
            >
              {t("settings.logsRefresh")}
            </button>
            <button
              type="button"
              onClick={clearLogs}
              disabled={!hasEntries}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("settings.logsClear")}
            </button>
            <button
              type="button"
              onClick={exportLogs}
              disabled={!hasEntries}
              className="h-8 shrink-0 rounded-md border border-border-subtle bg-card-bg px-2.5 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("settings.logsDownload")}
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

      <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
        <details className="rounded-lg border border-border-subtle bg-card-bg p-2">
          <summary className="cursor-pointer text-xs font-medium text-text-primary">
            {t("settings.diagnosticsSnapshot")}
          </summary>
          <pre
            className={`mt-2 max-h-52 overflow-auto rounded bg-bg p-1.5 text-[11px] leading-snug text-text-muted ${SCROLL_AREA_CLASS}`}
          >
            {diagnosticsSnapshotJson}
          </pre>
        </details>

        <div
          className={`flex items-center gap-1 overflow-x-auto pb-0.5 ${SCROLL_AREA_CLASS}`}
          role="group"
          aria-label={t("settings.logsSearch")}
        >
          <label className="min-w-0">
            <span className="sr-only">{t("settings.logsSearch")}</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
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
              onChange={(event) => setSourceFilter(event.target.value as LogSourceFilter)}
              className="h-8 min-w-[110px] rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary"
            >
              <option value="all">{t("settings.logsSourceAll")}</option>
              <option value="api">{t("settings.logsSourceApi")}</option>
              <option value="actions">{t("settings.logsSourceActions")}</option>
              <option value="console">{t("settings.logsSourceConsole")}</option>
              <option value="app">{t("settings.logsSourceApp")}</option>
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">{t("settings.logsLevelFilter")}</span>
            <select
              aria-label={t("settings.logsLevelFilter")}
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value as LogEntry["level"] | "all")}
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
              onChange={(event) => setScopeFilter(event.target.value)}
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
              onChange={(event) => setRuntimeFilter(event.target.value)}
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
            onClick={() => {
              setSearchQuery("");
              setLevelFilter("all");
              setSourceFilter("all");
              setScopeFilter("all");
              setRuntimeFilter("all");
            }}
            className="h-8 shrink-0 whitespace-nowrap rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated"
          >
            {t("settings.logsResetFilters")}
          </button>
        </div>
        <p className="text-[11px] text-text-muted">{logsResultLabel}</p>
        {!hasVisibleEntries ? (
          <div className="bg-card-bg/50 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle p-4 text-center text-text-muted">
            <Icon name="grid" size={32} className="opacity-50" />
            <p className="text-xs">{t("settings.logsEmpty")}</p>
          </div>
        ) : (
          <ul className={`flex min-h-0 flex-1 flex-col gap-1 overflow-auto ${SCROLL_AREA_CLASS}`}>
            {filteredEntries.map((entry, index) => {
              const serializedData = entry.data ? JSON.stringify(entry.data) : null;
              return (
                <li
                  key={`${entry.timestamp}-${index}`}
                  className="rounded-md border border-border-subtle p-2"
                >
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-text-muted">
                    <span className="rounded bg-bg px-1.5 py-0.5 font-mono uppercase">
                      {entry.level}
                    </span>
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
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
