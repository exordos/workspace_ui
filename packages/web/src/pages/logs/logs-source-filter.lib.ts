import type { LogEntry } from "~/shared/lib/logger";

export type LogSourceFilter = "all" | "api" | "actions" | "console" | "trace" | "app";

const ACTION_SCOPES = new Set(["action", "auth", "realtime"]);

function isTraceScope(scope: string): boolean {
  return scope.startsWith("trace:");
}

export function matchesLogSourceFilter(entry: LogEntry, filter: LogSourceFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "api") {
    return entry.scope === "api";
  }
  if (filter === "console") {
    return entry.scope === "console";
  }
  if (filter === "trace") {
    return isTraceScope(entry.scope);
  }
  if (filter === "actions") {
    return ACTION_SCOPES.has(entry.scope) || entry.scope.startsWith("action:");
  }
  return (
    entry.scope !== "api" &&
    entry.scope !== "console" &&
    !isTraceScope(entry.scope) &&
    !ACTION_SCOPES.has(entry.scope)
  );
}
