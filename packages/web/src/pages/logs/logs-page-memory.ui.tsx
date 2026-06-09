import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import {
  collectDiagnosticsMemorySnapshot,
  getJsHeapUtilizationPercent,
  type DiagnosticsMemorySnapshot,
} from "~/shared/lib/diagnostics-memory.lib";
import { formatBytes, formatKilobytes } from "~/shared/lib/format-bytes.lib";

const MEMORY_POLL_INTERVAL_MS = 3000;

export interface LogsPageMemorySectionProps {
  memorySnapshot: DiagnosticsMemorySnapshot | null;
  onSnapshotChange: (snapshot: DiagnosticsMemorySnapshot) => void;
  refreshToken: number;
}

export const LogsPageMemorySection: React.FC<LogsPageMemorySectionProps> = ({
  memorySnapshot,
  onSnapshotChange,
  refreshToken,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const refreshMemory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await collectDiagnosticsMemorySnapshot();
      if (!isMountedRef.current) return;
      onSnapshotChange(snapshot);
    } catch {
      if (!isMountedRef.current) return;
      setError(t("settings.diagnosticsMemoryUnavailable"));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [onSnapshotChange]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshMemory();
    const intervalId = window.setInterval(() => {
      void refreshMemory();
    }, MEMORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshMemory]);

  useEffect(() => {
    if (refreshToken === 0) return;
    void refreshMemory();
  }, [refreshToken, refreshMemory]);

  const jsHeap = memorySnapshot?.jsHeap ?? null;
  const jsHeapPercent = getJsHeapUtilizationPercent(jsHeap);
  const hasAnyMetric =
    memorySnapshot != null &&
    (memorySnapshot.capabilities.jsHeapAvailable ||
      memorySnapshot.capabilities.deviceMemoryAvailable ||
      memorySnapshot.capabilities.processMetricsAvailable);

  return (
    <section
      className="rounded-lg border border-border-subtle bg-card-bg p-3"
      aria-labelledby="diagnostics-memory-heading"
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 id="diagnostics-memory-heading" className="text-xs font-medium text-text-primary">
          {t("settings.diagnosticsMemory")}
        </h2>
        {loading && <span className="text-[11px] text-text-muted">…</span>}
      </div>

      <div className="space-y-2">
        {!hasAnyMetric && !loading && (
          <p className="text-[11px] leading-snug text-text-muted">
            {error ?? t("settings.diagnosticsMemoryUnavailable")}
          </p>
        )}

        {hasAnyMetric && memorySnapshot != null && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {jsHeap != null && (
                <MemoryCard
                  label={t("settings.diagnosticsMemoryJsHeap")}
                  value={formatBytes(jsHeap.usedBytes)}
                  detail={`${t("settings.diagnosticsMemoryJsHeapLimit")}: ${formatBytes(jsHeap.limitBytes)}`}
                />
              )}

              {memorySnapshot.electron != null && (
                <MemoryCard
                  label={t("settings.diagnosticsMemoryTotalApp")}
                  value={formatKilobytes(memorySnapshot.electron.totalWorkingSetKb)}
                />
              )}

              {memorySnapshot.electron != null && (
                <MemoryCard
                  label={t("settings.diagnosticsMemorySystemFree")}
                  value={formatKilobytes(memorySnapshot.electron.system.freeKb)}
                  detail={`${formatKilobytes(memorySnapshot.electron.system.totalKb)} total`}
                />
              )}

              {memorySnapshot.deviceMemoryGb != null && (
                <MemoryCard
                  label={t("settings.diagnosticsMemoryDeviceRam")}
                  value={`${memorySnapshot.deviceMemoryGb} GB`}
                />
              )}
            </div>

            {jsHeapPercent != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                  <span>{t("settings.diagnosticsMemoryJsHeap")}</span>
                  <span>{jsHeapPercent}%</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-bg"
                  role="progressbar"
                  aria-valuenow={jsHeapPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("settings.diagnosticsMemoryJsHeap")}
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${jsHeapPercent}%` }}
                  />
                </div>
              </div>
            )}

            {memorySnapshot.runtime === "browser" && (
              <p className="text-[11px] leading-snug text-text-muted">
                {t("settings.diagnosticsMemoryWebHint")} {t("settings.diagnosticsMemoryCpuWebHint")}
              </p>
            )}

            {memorySnapshot.electron != null && memorySnapshot.electron.processes.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-text-primary">
                  {t("settings.diagnosticsMemoryProcesses")}
                </p>
                <div className={`overflow-x-auto ${SCROLL_AREA_CLASS}`}>
                  <table className="w-full min-w-[420px] border-collapse text-[11px] text-text-muted">
                    <thead>
                      <tr className="border-b border-border-subtle text-left">
                        <th className="px-1 py-1 font-medium text-text-primary">Type</th>
                        <th className="px-1 py-1 font-medium text-text-primary">PID</th>
                        <th className="px-1 py-1 font-medium text-text-primary">Working set</th>
                        <th className="px-1 py-1 font-medium text-text-primary">Peak</th>
                        <th className="px-1 py-1 font-medium text-text-primary">
                          {t("settings.diagnosticsMemoryCpu")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {memorySnapshot.electron.processes.map((processRow) => (
                        <tr
                          key={`${processRow.pid}-${processRow.type}`}
                          className="border-border-subtle/60 border-b"
                        >
                          <td className="px-1 py-1 font-mono text-text-primary">
                            {processRow.type}
                          </td>
                          <td className="px-1 py-1 font-mono">{processRow.pid}</td>
                          <td className="px-1 py-1 font-mono">
                            {formatKilobytes(processRow.workingSetKb)}
                          </td>
                          <td className="px-1 py-1 font-mono">
                            {formatKilobytes(processRow.peakWorkingSetKb)}
                          </td>
                          <td className="px-1 py-1 font-mono">
                            {formatCpuPercent(processRow.cpuPercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {error != null && hasAnyMetric && <p className="text-[11px] text-text-muted">{error}</p>}
      </div>
    </section>
  );
};

function formatCpuPercent(cpuPercent: number | null): string {
  if (cpuPercent == null || !Number.isFinite(cpuPercent)) return "—";
  return `${cpuPercent.toFixed(1)}%`;
}

interface MemoryCardProps {
  label: string;
  value: string;
  detail?: string;
}

const MemoryCard: React.FC<MemoryCardProps> = ({ label, value, detail }) => (
  <div className="rounded-md border border-border-subtle bg-bg px-2 py-1.5">
    <p className="text-[11px] text-text-muted">{label}</p>
    <p className="text-sm font-medium text-text-primary">{value}</p>
    {detail != null && <p className="text-[11px] text-text-muted">{detail}</p>}
  </div>
);
