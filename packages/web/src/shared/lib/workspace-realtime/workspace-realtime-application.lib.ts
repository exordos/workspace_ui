export type WorkspaceRealtimeEventApplicationResult = "applied" | "stale";

export function isWorkspaceRealtimeEventApplicationStale(result: unknown): boolean {
  return result === "stale";
}
