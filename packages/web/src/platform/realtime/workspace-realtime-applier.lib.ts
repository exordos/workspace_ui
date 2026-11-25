import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeSkipReason,
  WorkspaceRealtimeSkippedEvent,
  WorkspaceRealtimeTransportState,
} from "./workspace-realtime-runtime.lib";

// A participant rejects only when it needs this event and its own projection is unavailable.
export class WorkspaceRealtimeParticipantNotReadyError extends Error {
  constructor(readonly participant: string) {
    super(`Workspace realtime participant is not ready: ${participant}`);
    this.name = "WorkspaceRealtimeParticipantNotReadyError";
  }
}

// Wait for every participant before reporting a failure and allowing replay.
async function applyToParticipants(
  appliers: readonly WorkspaceRealtimeEventApplier[],
  event: WorkspaceRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
): Promise<void> {
  const results = await Promise.allSettled(
    appliers.map(async (applier) => {
      await applier.applyEvent(event, context);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure != null) throw failure.reason;
}

// Compose independent participants while preserving the ordered event prefix.
export function composeWorkspaceRealtimeAppliers(
  appliers: readonly WorkspaceRealtimeEventApplier[],
): WorkspaceRealtimeEventApplier {
  return {
    async applyEvent(event: WorkspaceRealtimeEvent, context: WorkspaceRealtimeEventContext) {
      await applyToParticipants(appliers, event, context);
    },
    async applyEvents(events, context) {
      for (const event of events) {
        if (context.signal?.aborted) return;
        await applyToParticipants(appliers, event, context);
      }
    },
    async skipEvent(
      event: WorkspaceRealtimeEvent | WorkspaceRealtimeSkippedEvent,
      reason: WorkspaceRealtimeSkipReason,
      context: WorkspaceRealtimeEventContext,
    ) {
      await Promise.all(appliers.map((applier) => applier.skipEvent(event, reason, context)));
    },
    async onTransportStateChange(
      state: WorkspaceRealtimeTransportState,
      context: WorkspaceRealtimeRuntimeContext,
    ) {
      await Promise.all(appliers.map((applier) => applier.onTransportStateChange(state, context)));
    },
  };
}
