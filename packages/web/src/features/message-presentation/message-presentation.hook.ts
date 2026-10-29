import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { subscribeRealChatKeyChanges } from "~/entities/messenger/chat-crypto-resources.lib";
import {
  canPrepareMessengerEncryptedMessage,
  getImmediateMessengerMessageContent,
  getMessengerMessageContentKey,
  prepareMessengerMessageContent,
  type MessengerMessageContent,
} from "~/entities/messenger/messenger-message-content.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";

export type MessagePresentation = (MessengerMessageContent | { readonly status: "preparing" }) & {
  readonly retry: () => void;
  readonly canRequestKey?: boolean;
  readonly retryPending?: boolean;
};

export const MessagePresentationContext = createContext<ReadonlyMap<
  string,
  MessagePresentation
> | null>(null);

interface PreparedMessage {
  readonly message: MessengerMessage;
  value?: MessengerMessageContent;
  phase: "queued" | "running" | "settled";
}

class MessagePreparation {
  readonly entries = new Map<string, PreparedMessage>();
  active = false;

  constructor(readonly scope: string) {}

  start() {
    this.active = true;
  }

  dispose() {
    this.active = false;
    this.entries.clear();
  }
}

const NOOP = () => undefined;
const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

/** Owns temporary results and invalidation; consumers decide when to show a message or window. */
export function useMessagePresentations(
  messages: readonly MessengerMessage[],
  consumerScope: string,
) {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const owner = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const catalogOwner = useMessengerStore((state) => state.ownerKey);
  const messageOwner = useWorkspaceMessageStore((state) => state.ownerKey);
  const encryptedMessages = useMemo(
    () => messages.filter((message) => message.payload.kind === "e2ee"),
    [messages],
  );
  const streams = useMessengerStore(
    useShallow((state) =>
      encryptedMessages.map((message) => state.streamsById[message.streamUuid]),
    ),
  );
  const scope = JSON.stringify([owner, runtime?.runtimeGeneration, consumerScope]);
  const preparation = useMemo(() => new MessagePreparation(scope), [scope]);
  const [revision, publish] = useReducer((value: number) => value + 1, 0);
  const requests = useMemo(
    () =>
      encryptedMessages.map((message, index) => ({
        message,
        key: getMessengerMessageContentKey(message),
        allowed: canPrepareMessengerEncryptedMessage({
          runtime,
          message,
          catalogOwner,
          messageOwner,
          stream: streams[index],
        }),
      })),
    [encryptedMessages, streams, runtime, catalogOwner, messageOwner],
  );

  useEffect(() => {
    preparation.start();
    return () => preparation.dispose();
  }, [preparation]);

  useEffect(
    () =>
      subscribeRealChatKeyChanges((change) => {
        let changed = false;
        for (const [key, entry] of preparation.entries) {
          const payload = entry.message.payload;
          if (
            payload.kind !== "e2ee" ||
            (change != null &&
              (change.ownerKey !== owner ||
                change.streamUuid !== entry.message.streamUuid ||
                change.keyUuid !== payload.keyUuid))
          )
            continue;
          // Replacing the entry also fences work started before key removal.
          preparation.entries.set(key, {
            message: entry.message,
            phase: "queued",
            value: change?.kind === "removed" ? { status: "missing-key" } : entry.value,
          });
          changed = true;
        }
        if (changed) publish();
      }),
    [owner, preparation],
  );

  const retry = useCallback(
    (key: string) => {
      const entry = preparation.entries.get(key);
      if (entry == null || !preparation.active) return;
      preparation.entries.set(key, {
        message: entry.message,
        value: entry.value,
        phase: "queued",
      });
      publish();
    },
    [preparation],
  );

  useEffect(() => {
    const activeKeys = new Set(requests.filter(({ allowed }) => allowed).map(({ key }) => key));
    for (const key of preparation.entries.keys()) {
      if (!activeKeys.has(key)) preparation.entries.delete(key);
    }
    const requestContext = captureWorkspaceRuntimeRequestContext(getRuntime);
    for (const { key, message, allowed } of requests) {
      if (!allowed || runtime == null) continue;
      let entry = preparation.entries.get(key);
      if (entry == null) {
        entry = { message, phase: "queued" };
        preparation.entries.set(key, entry);
      }
      if (entry.phase !== "queued") continue;
      const currentEntry = entry;
      const isCurrent = () => {
        const catalog = useMessengerStore.getState();
        return (
          preparation.active &&
          preparation.entries.get(key) === currentEntry &&
          !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntime) &&
          canPrepareMessengerEncryptedMessage({
            runtime: getRuntime(),
            message,
            catalogOwner: catalog.ownerKey,
            messageOwner: useWorkspaceMessageStore.getState().ownerKey,
            stream: catalog.streamsById[message.streamUuid],
          })
        );
      };
      currentEntry.phase = "running";
      // Each task belongs to its entry; metadata renders do not restart or cancel it.
      void prepareMessengerMessageContent(runtime, message, isCurrent).then((value) => {
        if (!isCurrent()) return;
        currentEntry.value = value;
        currentEntry.phase = "settled";
        publish();
      });
    }
  }, [requests, runtime, preparation, revision]);

  const presentations = new Map<string, MessagePresentation>();
  const pendingMessageUuids = new Set<string>();
  for (const message of messages) {
    const key = getMessengerMessageContentKey(message);
    const immediate = getImmediateMessengerMessageContent(message);
    if (immediate != null) presentations.set(key, { ...immediate, retry: NOOP });
  }
  for (const { key, message, allowed } of requests) {
    const entry = preparation.entries.get(key);
    const value = allowed
      ? (entry?.value ?? { status: "preparing" as const })
      : { status: "missing-key" as const };
    if (value.status === "preparing") pendingMessageUuids.add(message.uuid);
    presentations.set(key, {
      ...value,
      retry: () => retry(key),
      retryPending: allowed && entry?.value != null && entry.phase !== "settled",
      canRequestKey:
        allowed &&
        (value.status === "missing-key" ||
          (value.status === "error" && value.canRequestKey === true)),
    });
  }
  return { scope, presentations, pendingMessageUuids };
}

/** Reading a prepared result does not create another asynchronous lifecycle. */
export function usePreparedMessagePresentation(
  message: MessengerMessage | null,
): MessagePresentation | undefined {
  const prepared = useContext(MessagePresentationContext);
  if (message == null) return undefined;
  const supplied = prepared?.get(getMessengerMessageContentKey(message));
  if (supplied != null) return supplied;
  const immediate = getImmediateMessengerMessageContent(message);
  return immediate == null ? undefined : { ...immediate, retry: NOOP };
}

/** Mount only in a fallback component when no prepared encrypted result exists. */
export function useMessagePresentation(message: MessengerMessage | null): MessagePresentation {
  const messages = useMemo(() => (message == null ? [] : [message]), [message]);
  const local = useMessagePresentations(messages, "single-message");
  return (
    (message == null
      ? undefined
      : local.presentations.get(getMessengerMessageContentKey(message))) ?? {
      status: "missing-key",
      retry: NOOP,
      canRequestKey: false,
    }
  );
}
