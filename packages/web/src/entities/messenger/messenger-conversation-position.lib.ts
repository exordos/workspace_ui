import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { parseMessengerConversationId } from "./messenger-ids.lib";
import type { MessengerConversationId } from "./messenger.types";

export type MessengerConversationPosition =
  | { kind: "bottom"; messageKey: string }
  | { kind: "anchor"; messageKey: string; offsetTop: number };

interface PositionEntry {
  position: MessengerConversationPosition | null;
}

const MAX_POSITIONS = 12;
const positions = new Map<MessengerConversationId, PositionEntry>();
let activeRuntimeKey: string | null = null;

function currentRuntimeKey(): string | null {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  return context == null
    ? null
    : `${workspaceRuntimeOwnerKey(context)}\u0000${context.runtimeGeneration}`;
}

function synchronizeRuntime(): void {
  const key = currentRuntimeKey();
  if (key === activeRuntimeKey) return;
  activeRuntimeKey = key;
  positions.clear();
}

/** A mounted view holds a lease: explicit read commands retire it before old cleanup can save. */
export function openMessengerConversationPosition(conversationId: MessengerConversationId) {
  synchronizeRuntime();
  const runtimeKey = activeRuntimeKey;
  const entry = positions.get(conversationId) ?? { position: null };
  positions.delete(conversationId);
  positions.set(conversationId, entry);
  while (positions.size > MAX_POSITIONS) {
    const oldest = positions.keys().next();
    if (!oldest.done) positions.delete(oldest.value);
  }
  const isCurrent = () =>
    runtimeKey != null &&
    currentRuntimeKey() === runtimeKey &&
    positions.get(conversationId) === entry;
  return {
    read: () => (isCurrent() ? entry.position : null),
    save(position: MessengerConversationPosition, userInput = false) {
      if (userInput && runtimeKey != null && currentRuntimeKey() === runtimeKey) {
        positions.set(conversationId, entry);
      }
      if (isCurrent()) entry.position = position;
    },
  };
}

/** Invalidate the stream view too: it can contain messages from the affected topic. */
export function forgetMessengerConversationPositions(scope: {
  streamUuid: string;
  topicUuid?: string;
}): void {
  synchronizeRuntime();
  for (const conversationId of positions.keys()) {
    const conversation = parseMessengerConversationId(conversationId);
    if (
      conversation?.streamUuid === scope.streamUuid &&
      (scope.topicUuid == null ||
        conversation.kind === "stream" ||
        conversation.topicUuid === scope.topicUuid)
    ) {
      positions.delete(conversationId);
    }
  }
}

const unsubscribeAuth = useWorkspaceAuthStore.subscribe(synchronizeRuntime);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    positions.clear();
  });
