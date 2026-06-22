import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { deleteQueue } from "~/shared/api/messenger-queue";
import type { RegisterQueueResult, MessengerCredentials } from "~/shared/api/messenger.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

export interface InactiveInstanceQueueRegistration {
  queueId: string;
  registration: RegisterQueueResult | null | undefined;
}

export function handleInactiveInstanceQueueRegistered(
  params: InactiveInstanceQueueRegistration & {
    stopped: boolean;
    credentials: MessengerCredentials;
    instance: WorkspaceInstance | undefined;
    onQueueRegistered?: (id: string, registration?: RegisterQueueResult) => void;
  },
): string | null {
  const { queueId, registration, stopped, credentials, onQueueRegistered } = params;
  if (stopped) {
    void deleteQueue(queueId, credentials).catch((err) =>
      reportUnexpectedError("layout:inactiveQueue", err, { phase: "stoppedCleanup", queueId }),
    );
    return null;
  }
  onQueueRegistered?.(queueId, registration ?? undefined);
  return queueId;
}

export function abortInactiveInstanceQueueOnTeardown(
  queueId: string | null,
  credentials: MessengerCredentials,
  controller: AbortController,
): void {
  if (queueId != null) {
    void deleteQueue(queueId, credentials).catch((err) =>
      reportUnexpectedError("layout:inactiveQueue", err, { phase: "teardown", queueId }),
    );
  }
  controller.abort();
}
