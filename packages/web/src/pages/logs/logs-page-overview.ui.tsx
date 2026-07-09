import React from "react";
import { t } from "~/i18n/i18n";
import type { DiagnosticsPageSnapshot } from "./diagnostics-collect.lib";

export interface LogsPageOverviewProps {
  snapshot: DiagnosticsPageSnapshot;
  pingState: "idle" | "loading" | "success" | "error";
  pingLatencyMs: number | null;
  onPingServer: () => void;
  onOpenLogs: () => void;
}

const STATUS_DOT: Record<DiagnosticsPageSnapshot["overallStatus"], string> = {
  healthy: "bg-indicator-green",
  degraded: "bg-indicator-yellow",
  offline: "bg-indicator-red",
};

const STATUS_LABEL_KEY: Record<DiagnosticsPageSnapshot["overallStatus"], string> = {
  healthy: "settings.diagnosticsStatusHealthy",
  degraded: "settings.diagnosticsStatusDegraded",
  offline: "settings.diagnosticsStatusOffline",
};

export const LogsPageOverview: React.FC<LogsPageOverviewProps> = ({
  snapshot,
  pingState,
  pingLatencyMs,
  onPingServer,
  onOpenLogs,
}) => {
  const collectedAtMs = Date.parse(snapshot.collectedAt);
  const lastEventAgeMs =
    snapshot.realtime.stats.lastEventAt != null && !Number.isNaN(collectedAtMs)
      ? collectedAtMs - snapshot.realtime.stats.lastEventAt
      : null;

  return (
    <section className="space-y-2" aria-label={t("settings.diagnosticsOverview")}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg px-2.5 py-1 text-xs font-medium text-text-primary`}
        >
          <span
            className={`h-2 w-2 rounded-full ${STATUS_DOT[snapshot.overallStatus]}`}
            aria-hidden
          />
          {t(STATUS_LABEL_KEY[snapshot.overallStatus])}
        </span>
        <button
          type="button"
          onClick={onPingServer}
          disabled={pingState === "loading"}
          className="h-7 rounded-md border border-border-subtle bg-card-bg px-2 text-xs text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
        >
          {pingState === "loading"
            ? t("settings.diagnosticsPingServer")
            : pingState === "success" && pingLatencyMs != null
              ? t("settings.diagnosticsPingSuccess", { ms: pingLatencyMs })
              : pingState === "error"
                ? t("settings.diagnosticsPingFailed")
                : t("settings.diagnosticsPingServer")}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <DiagnosticCard title={t("settings.diagnosticsConnection")}>
          <p className="font-medium capitalize text-text-primary">{snapshot.connection.phase}</p>
          {snapshot.connection.failureReason != null && (
            <p className="text-text-muted">{snapshot.connection.failureReason}</p>
          )}
          <p className="text-text-muted">
            {t("settings.diagnosticsReconnectAttempt", {
              count: snapshot.connection.reconnectAttempt,
            })}
          </p>
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsRealtime")}>
          <p className="font-medium text-text-primary">
            {t("settings.diagnosticsEventsReceived", {
              count: snapshot.realtime.stats.eventsReceivedCount,
            })}
          </p>
          <p className="text-text-muted">
            {snapshot.realtime.online ? t("presence.online") : t("settings.diagnosticsOffline")}
            {" · "}
            {snapshot.realtime.tabVisible
              ? t("settings.diagnosticsTabVisible")
              : t("settings.diagnosticsTabHidden")}
          </p>
          {lastEventAgeMs != null && (
            <p className="text-text-muted">
              {t("settings.diagnosticsLastEvent", {
                type: snapshot.realtime.stats.lastEventType ?? "?",
                seconds: Math.round(lastEventAgeMs / 1000),
              })}
            </p>
          )}
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsSession")}>
          <p className="truncate font-medium text-text-primary">
            {snapshot.workspaceSession.login ?? t("settings.diagnosticsNoSession")}
          </p>
          <p className="truncate text-text-muted">
            {snapshot.workspaceSession.organizationOrigin ?? "—"}
          </p>
          <p className="text-text-muted">
            {t("settings.diagnosticsWorkspaceSessionsCount", {
              count: snapshot.workspaceSession.count,
            })}
          </p>
          {snapshot.session.sessionRemainingMs != null && (
            <p className="text-text-muted">
              {t("settings.diagnosticsSessionRemaining", {
                minutes: Math.ceil(snapshot.session.sessionRemainingMs / 60_000),
              })}
            </p>
          )}
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsRuntime")}>
          <p className="font-medium text-text-primary">{snapshot.runtime.detectedRuntime}</p>
          <p className="text-text-muted">v{snapshot.environment.appVersion}</p>
          <p className="truncate text-text-muted">{snapshot.environment.brandAppName}</p>
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsNotifications")}>
          <p className="font-medium capitalize text-text-primary">
            {snapshot.notifications.permission}
          </p>
          <p className="text-text-muted">{t("settings.diagnosticsNotificationPermission")}</p>
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsLogCounts")}>
          <div className="flex flex-wrap gap-1.5">
            <LogCountBadge level="error" count={snapshot.logs.byLevel.error} />
            <LogCountBadge level="warn" count={snapshot.logs.byLevel.warn} />
            <LogCountBadge level="info" count={snapshot.logs.byLevel.info} />
            <LogCountBadge level="debug" count={snapshot.logs.byLevel.debug} />
          </div>
          <button
            type="button"
            onClick={onOpenLogs}
            className="mt-2 h-7 rounded-md border border-border-subtle bg-bg px-2 text-[11px] text-text-primary transition-colors hover:bg-bg-elevated"
          >
            {t("settings.logsViewModal")}
          </button>
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsPerformance")}>
          {snapshot.performance.vitals.length === 0 ? (
            <p className="text-text-muted">{t("settings.diagnosticsPerformanceEmpty")}</p>
          ) : (
            snapshot.performance.vitals.map((vital) => (
              <p key={vital.name} className="text-text-muted">
                {vital.name}: {vital.value}
              </p>
            ))
          )}
          {snapshot.performance.apiLatency.sampleCount > 0 && (
            <p className="mt-1 text-text-muted">
              {t("settings.diagnosticsApiLatency", {
                median: snapshot.performance.apiLatency.medianMs ?? 0,
                p95: snapshot.performance.apiLatency.p95Ms ?? 0,
                count: snapshot.performance.apiLatency.sampleCount,
              })}
            </p>
          )}
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsCache")}>
          {snapshot.cache == null ? (
            <p className="text-text-muted">{t("settings.diagnosticsCacheUnavailable")}</p>
          ) : (
            <>
              <p className="text-text-muted">
                {t("settings.diagnosticsCachePartitions", {
                  count: snapshot.cache.messagesCount,
                })}
              </p>
              <p className="text-text-muted">
                {snapshot.cache.hasOwnerMeta
                  ? t("settings.diagnosticsCacheChatListYes")
                  : t("settings.diagnosticsCacheChatListNo")}
              </p>
              {snapshot.cache.foldersCount != null && (
                <p className="text-text-muted">
                  {t("settings.diagnosticsCacheFolders", { count: snapshot.cache.foldersCount })}
                </p>
              )}
            </>
          )}
        </DiagnosticCard>

        <DiagnosticCard title={t("settings.diagnosticsStores")}>
          <p className="text-text-muted">
            {t("settings.diagnosticsStoresStreams", { count: snapshot.stores.streamsCount })}
          </p>
          <p className="text-text-muted">
            {t("settings.diagnosticsStoresDms", { count: snapshot.stores.conversationsCount })}
          </p>
          <p className="text-text-muted">
            {t("settings.diagnosticsStoresUsers", { count: snapshot.stores.usersCount })}
          </p>
        </DiagnosticCard>
      </div>
    </section>
  );
};

interface DiagnosticCardProps {
  title: string;
  children: React.ReactNode;
}

const DiagnosticCard: React.FC<DiagnosticCardProps> = ({ title, children }) => (
  <article className="rounded-lg border border-border-subtle bg-card-bg p-3">
    <h3 className="mb-1.5 text-xs font-medium text-text-primary">{title}</h3>
    <div className="space-y-0.5 text-[11px] leading-snug">{children}</div>
  </article>
);

interface LogCountBadgeProps {
  level: keyof DiagnosticsPageSnapshot["logs"]["byLevel"];
  count: number;
}

const LogCountBadge: React.FC<LogCountBadgeProps> = ({ level, count }) => (
  <span className="rounded bg-bg px-1.5 py-0.5 font-mono uppercase text-text-muted">
    {level}: {count}
  </span>
);
