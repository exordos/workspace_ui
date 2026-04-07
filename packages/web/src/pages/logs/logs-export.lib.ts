import { redact, type LogEntry } from "~/shared/lib/logger";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildLogsExportFilename(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = pad2(now.getUTCMonth() + 1);
  const day = pad2(now.getUTCDate());
  const hours = pad2(now.getUTCHours());
  const minutes = pad2(now.getUTCMinutes());
  const seconds = pad2(now.getUTCSeconds());
  return `workspace-logs-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
}

export function serializeLogsForExport(entries: readonly LogEntry[]): string {
  const sanitizedEntries = entries.map((entry) => ({
    ...entry,
    ...(entry.data ? { data: redact(entry.data) as Record<string, unknown> } : {}),
  }));
  return JSON.stringify(sanitizedEntries, null, 2);
}

export function downloadLogsAsFile(entries: readonly LogEntry[]): void {
  if (entries.length === 0) {
    return;
  }

  const blob = new Blob([serializeLogsForExport(entries)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = buildLogsExportFilename();
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
