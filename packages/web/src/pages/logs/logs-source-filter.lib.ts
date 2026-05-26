import type { LogEntry } from "~/shared/lib/logger";

export type LogSourceFilter = "all" | "api" | "actions" | "console" | "app";

const ACTION_SCOPES = new Set(["action", "auth", "realtime"]);

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
  if (filter === "actions") {
    return ACTION_SCOPES.has(entry.scope) || entry.scope.startsWith("action:");
  }
  return entry.scope !== "api" && entry.scope !== "console" && !ACTION_SCOPES.has(entry.scope);
}
