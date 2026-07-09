/**
 * Builds the diagnostics dashboard snapshot from runtime modules and page inputs.
 */

import { brand } from "~/shared/lib/brand";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import type { ApiLatencySummary } from "~/shared/lib/diagnostics-api-latency.lib";
import { summarizeApiLogs } from "~/shared/lib/diagnostics-api-latency.lib";
import type { DiagnosticIdbSnapshot } from "~/shared/lib/diagnostics-idb.lib";
import type { DiagnosticsMemorySnapshot } from "~/shared/lib/diagnostics-memory.lib";
import type { DiagnosticRealtimeStats } from "~/shared/lib/diagnostics-realtime.lib";
import type { DiagnosticVitalEntry } from "~/shared/lib/diagnostics-vitals.lib";
import { isElectron } from "~/shared/lib/electron";
import { env } from "~/shared/lib/env";
import type { LogEntry } from "~/shared/lib/logger";
import { isOnline } from "~/shared/lib/network";
import { getIdleTimeMs, getLocalPresenceStatus } from "~/shared/lib/presence";
import { getRuntime, isPwa } from "~/shared/lib/pwa";
import { isTabVisible } from "~/shared/lib/visibility";
import { getWebViewPlatform, isWebView } from "~/shared/lib/webview";

export type DiagnosticsOverallStatus = "healthy" | "degraded" | "offline";

export interface DiagnosticsPageSnapshot {
  collectedAt: string;
  overallStatus: DiagnosticsOverallStatus;
  connection: ConnectionHealthSnapshot;
  rateLimitBlockedUntil: number | null;
  realtime: {
    online: boolean;
    tabVisible: boolean;
    stats: DiagnosticRealtimeStats;
  };
  runtime: {
    mode: string;
    detectedRuntime: ReturnType<typeof getRuntime>;
    isElectron: boolean;
    isPwa: boolean;
    isWebView: boolean;
    webViewPlatform: ReturnType<typeof getWebViewPlatform>;
    online: boolean;
    tabVisible: boolean;
    localPresence: ReturnType<typeof getLocalPresenceStatus>;
    idleTimeMs: number;
    serviceWorkerController: string | null;
    path: string;
    href: string;
    viewport: { width: number; height: number; devicePixelRatio: number } | null;
    screen: {
      width: number | null;
      height: number | null;
      availWidth: number | null;
      availHeight: number | null;
    } | null;
    userAgent: string;
    language: string;
    languages: string[];
  };
  environment: {
    appVersion: string;
    brandAppName: string;
    brandAppId: string;
    workspaceApiOrigin: string;
    workspaceApiBase: string;
    workspaceUploadsOrigin: string;
    jitsiDomain: string;
    baseUrl: string;
    cdnUrl: string;
  };
  session: {
    currentUserUuid: string | null;
    locale: string;
    themeMode: string;
    themePalette: string;
    prioritizePersonalUnread: boolean;
    prioritizeUnmutedUnreadChannels: boolean;
    notificationSound: string;
    folderRailLayout: string;
    sessionRemainingMs: number | null;
    authIdleTimeoutMs: number | null;
  };
  stores: {
    streamsCount: number;
    conversationsCount: number;
    foldersCount: number;
    usersCount: number;
    currentChatMessagesCount: number;
  };
  workspaceSession: {
    count: number;
    accountId: string | null;
    instanceId: string | null;
    organizationOrigin: string | null;
    projectId: string | null;
    userUuid: string | null;
    login: string | null;
    ownerKey: string | null;
  };
  notifications: {
    permission: NotificationPermission | "unsupported";
  };
  memory: DiagnosticsMemorySnapshot | null;
  performance: {
    vitals: readonly DiagnosticVitalEntry[];
    apiLatency: ApiLatencySummary;
  };
  cache: DiagnosticIdbSnapshot | null;
  logs: {
    total: number;
    filtered: number;
    byLevel: Record<LogEntry["level"], number>;
    scopes: string[];
    runtimes: string[];
    recentErrors: LogEntry[];
  };
}

export interface DiagnosticsCollectInput {
  pathname: string;
  entries: readonly LogEntry[];
  filteredCount: number;
  connection: ConnectionHealthSnapshot;
  rateLimitBlockedUntil: number | null;
  memorySnapshot: DiagnosticsMemorySnapshot | null;
  vitals: readonly DiagnosticVitalEntry[];
  cache: DiagnosticIdbSnapshot | null;
  realtimeStats: DiagnosticRealtimeStats;
  sessionRemainingMs: number | null;
  authIdleTimeoutMs: number | null;
  currentUserUuid: string | null;
  streamsCount: number;
  conversationsCount: number;
  foldersCount: number;
  usersCount: number;
  currentChatMessagesCount: number;
  workspaceSessionsCount: number;
  workspaceAccountId: string | null;
  workspaceInstanceId: string | null;
  workspaceOrganizationOrigin: string | null;
  workspaceProjectId: string | null;
  workspaceUserUuid: string | null;
  workspaceLogin: string | null;
  workspaceOwnerKey: string | null;
  settingsLanguage: string;
  themeMode: string;
  themePalette: string;
  prioritizePersonalUnread: boolean;
  prioritizeUnmutedUnreadChannels: boolean;
  notificationSound: string;
  folderRailLayout: string;
}

const RECENT_ERROR_LIMIT = 8;
const RECENT_ERROR_WINDOW_MS = 15 * 60 * 1000;

/** Maps connection health and logs into an overall dashboard status. */
export function resolveDiagnosticsOverallStatus(
  connection: ConnectionHealthSnapshot,
  online: boolean,
  recentErrorCount: number,
): DiagnosticsOverallStatus {
  if (connection.phase === "offline" || !online) {
    return "offline";
  }
  if (
    connection.phase === "degraded" ||
    connection.phase === "blocked" ||
    connection.phase === "rate_limited" ||
    connection.phase === "connecting" ||
    recentErrorCount > 0
  ) {
    return "degraded";
  }
  return "healthy";
}

function collectRecentErrors(entries: readonly LogEntry[]): LogEntry[] {
  const cutoff = Date.now() - RECENT_ERROR_WINDOW_MS;
  return entries
    .filter((entry) => entry.level === "error" && Date.parse(entry.timestamp) >= cutoff)
    .slice(0, RECENT_ERROR_LIMIT);
}

function countRecentErrors(entries: readonly LogEntry[]): number {
  const cutoff = Date.now() - RECENT_ERROR_WINDOW_MS;
  return entries.filter((entry) => entry.level === "error" && Date.parse(entry.timestamp) >= cutoff)
    .length;
}

/** Pure snapshot builder for the diagnostics dashboard and copy/export actions. */
export function collectDiagnosticsPageSnapshot(
  input: DiagnosticsCollectInput,
): DiagnosticsPageSnapshot {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  const serviceWorkerController =
    hasNavigator && "serviceWorker" in navigator
      ? (navigator.serviceWorker.controller?.scriptURL ?? null)
      : null;

  const logsByLevel = input.entries.reduce(
    (acc, entry) => {
      acc[entry.level] += 1;
      return acc;
    },
    { debug: 0, info: 0, warn: 0, error: 0 },
  );

  const scopeOptions = Array.from(new Set(input.entries.map((entry) => entry.scope))).sort((a, b) =>
    a.localeCompare(b),
  );
  const runtimeOptions = Array.from(new Set(input.entries.map((entry) => entry.runtime))).sort(
    (a, b) => a.localeCompare(b),
  );

  const online = isOnline();
  const recentErrors = collectRecentErrors(input.entries);
  const connection = input.connection;

  return {
    collectedAt: new Date().toISOString(),
    overallStatus: resolveDiagnosticsOverallStatus(
      connection,
      online,
      countRecentErrors(input.entries),
    ),
    connection,
    rateLimitBlockedUntil: input.rateLimitBlockedUntil,
    realtime: {
      online,
      tabVisible: isTabVisible(),
      stats: input.realtimeStats,
    },
    runtime: {
      mode: env.MODE,
      detectedRuntime: getRuntime(),
      isElectron: isElectron(),
      isPwa: isPwa(),
      isWebView: isWebView(),
      webViewPlatform: getWebViewPlatform(),
      online,
      tabVisible: isTabVisible(),
      localPresence: getLocalPresenceStatus(),
      idleTimeMs: getIdleTimeMs(),
      serviceWorkerController,
      path: input.pathname,
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
      brandAppName: brand.appName,
      brandAppId: brand.appId,
      workspaceApiOrigin: env.WORKSPACE_API_ORIGIN,
      workspaceApiBase: env.WORKSPACE_API_BASE,
      workspaceUploadsOrigin: env.WORKSPACE_UPLOADS_ORIGIN,
      jitsiDomain: env.JITSI_MEET_DOMAIN,
      baseUrl: env.BASE_URL,
      cdnUrl: env.CDN_URL,
    },
    session: {
      currentUserUuid: input.currentUserUuid,
      locale: input.settingsLanguage,
      themeMode: input.themeMode,
      themePalette: input.themePalette,
      prioritizePersonalUnread: input.prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels: input.prioritizeUnmutedUnreadChannels,
      notificationSound: input.notificationSound,
      folderRailLayout: input.folderRailLayout,
      sessionRemainingMs: input.sessionRemainingMs,
      authIdleTimeoutMs: input.authIdleTimeoutMs,
    },
    stores: {
      streamsCount: input.streamsCount,
      conversationsCount: input.conversationsCount,
      foldersCount: input.foldersCount,
      usersCount: input.usersCount,
      currentChatMessagesCount: input.currentChatMessagesCount,
    },
    workspaceSession: {
      count: input.workspaceSessionsCount,
      accountId: input.workspaceAccountId,
      instanceId: input.workspaceInstanceId,
      organizationOrigin: input.workspaceOrganizationOrigin,
      projectId: input.workspaceProjectId,
      userUuid: input.workspaceUserUuid,
      login: input.workspaceLogin,
      ownerKey: input.workspaceOwnerKey,
    },
    notifications: {
      permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    },
    memory: input.memorySnapshot,
    performance: {
      vitals: input.vitals,
      apiLatency: summarizeApiLogs(input.entries),
    },
    cache: input.cache,
    logs: {
      total: input.entries.length,
      filtered: input.filteredCount,
      byLevel: logsByLevel,
      scopes: scopeOptions,
      runtimes: runtimeOptions,
      recentErrors,
    },
  };
}

/** Subset for support copy: connection, realtime, Workspace session, recent errors. */
export function buildConnectionReportSnapshot(
  snapshot: DiagnosticsPageSnapshot,
): Record<string, unknown> {
  return {
    collectedAt: snapshot.collectedAt,
    overallStatus: snapshot.overallStatus,
    connection: snapshot.connection,
    rateLimitBlockedUntil: snapshot.rateLimitBlockedUntil,
    realtime: snapshot.realtime,
    workspaceSession: snapshot.workspaceSession,
    recentErrors: snapshot.logs.recentErrors.map((entry) => ({
      timestamp: entry.timestamp,
      scope: entry.scope,
      message: entry.message,
      data: entry.data,
    })),
  };
}
