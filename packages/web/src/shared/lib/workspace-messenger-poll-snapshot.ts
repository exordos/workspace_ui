// The message store and durable cache both reconcile the poll pair independently of other fields.
export function reconcileWorkspacePollSnapshot<
  Payload extends { kind: string },
  State extends { revision: number; isClosed: boolean },
  Timestamp extends string | null | undefined,
>(
  previous: { payload: Payload; pollState?: State | null; updatedAt?: Timestamp },
  incoming: { payload: Payload; pollState?: State | null; updatedAt?: Timestamp },
): { payload: Payload; pollState: State; updatedAt: Timestamp | undefined } | null {
  if (previous.payload.kind !== "poll" || incoming.payload.kind !== "poll") return null;
  const currentState = previous.pollState;
  const incomingState = incoming.pollState;
  if (
    incomingState == null ||
    (currentState != null && currentState.revision > incomingState.revision)
  ) {
    return currentState == null
      ? null
      : { payload: previous.payload, pollState: currentState, updatedAt: previous.updatedAt };
  }

  const isClosedAtSameRevision =
    currentState?.revision === incomingState.revision && currentState.isClosed;
  // Votes may advance the poll revision without changing the message timestamp.
  const hasNewerTimestamp =
    incoming.updatedAt != null &&
    (previous.updatedAt == null || isLaterMessageTimestamp(incoming.updatedAt, previous.updatedAt));
  return {
    payload: incoming.payload,
    pollState:
      isClosedAtSameRevision && !incomingState.isClosed
        ? { ...incomingState, isClosed: true }
        : incomingState,
    updatedAt: hasNewerTimestamp ? incoming.updatedAt : previous.updatedAt,
  };
}
import { isLaterMessageTimestamp } from "./workspace-messenger-message-time";
