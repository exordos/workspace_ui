import { invokeUserPresence, type WorkspaceClientOptions } from "~/shared/api/workspace-client";

export const WORKSPACE_PRESENCE_REPORT_INTERVAL_MS = 30_000;

export interface WorkspacePresenceReporterOptions {
  clientOptions: WorkspaceClientOptions;
  userUuid: string;
  reportIntervalMs?: number;
  onError?: (error: unknown) => void;
  invokePresence?: typeof invokeUserPresence;
}

export function startWorkspacePresenceReporter({
  clientOptions,
  userUuid,
  reportIntervalMs = WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  onError,
  invokePresence = invokeUserPresence,
}: WorkspacePresenceReporterOptions): () => void {
  const controller = new AbortController();
  let stopped = false;

  function report(): void {
    if (stopped || controller.signal.aborted) return;

    void invokePresence(
      {
        ...clientOptions,
        signal: controller.signal,
      },
      userUuid,
      { status: "active" },
    ).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        onError?.(error);
      }
    });
  }

  report();
  const intervalId = setInterval(report, reportIntervalMs);

  return () => {
    stopped = true;
    controller.abort();
    clearInterval(intervalId);
  };
}
