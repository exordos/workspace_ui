/**
 * React hook: subscribe to IndexedDB-backed messages for the active chat context.
 *
 * Used when `env.CHAT_MESSAGES_SOURCE_INDEXEDDB` is true (disabled in Vitest `MODE=test`).
 */
import { useEffect, useRef, useState } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { env } from "~/shared/lib/env";
import { logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import { createLogger } from "~/shared/lib/logger";
import { getChatMessagesAscending } from "~/shared/lib/message-cache-db";
import { subscribeMessageCache } from "~/shared/lib/message-cache-bus";
import { chatKeyFromContext, instanceChatKey } from "~/shared/lib/message-cache-keys.lib";
import type { CurrentChatContext } from "./message.model.types";

const EMPTY: MockMessage[] = [];

const idbHookLog = createLogger("idb:chat-messages-hook");

export function useIndexedDbMessageSourceEnabled(): boolean {
  return env.CHAT_MESSAGES_SOURCE_INDEXEDDB;
}

export function useIndexedDbChatMessages(options: {
  context: CurrentChatContext | null;
}): MockMessage[] {
  const { context } = options;
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const [messages, setMessages] = useState<MockMessage[]>(EMPTY);
  const lastSerializedRef = useRef<string>("");

  useEffect(() => {
    if (!env.CHAT_MESSAGES_SOURCE_INDEXEDDB || context == null) {
      lastSerializedRef.current = "";
      setMessages(EMPTY);
      return;
    }

    if (currentInstanceId == null) {
      lastSerializedRef.current = "";
      setMessages(EMPTY);
      return;
    }

    // Reset so we never skip setMessages after remount when ids match the previous chat (ref persists).
    lastSerializedRef.current = "";
    setMessages(EMPTY);

    const chatKey = chatKeyFromContext(context);
    const iKey = instanceChatKey(currentInstanceId, chatKey);

    let cancelled = false;

    const load = () => {
      void getChatMessagesAscending(currentInstanceId, chatKey)
        .then((rows) => {
          if (cancelled) return;
          const serialized = rows.map((m) => m.id).join(",");
          if (serialized === lastSerializedRef.current) {
            idbHookLog.debug("skip setState: same id sequence as last read", {
              iKey,
              rowCount: rows.length,
            });
            logMessageFlow("idb:hook skip same serialized ids", {
              iKey,
              chatKey,
              rowCount: rows.length,
              firstId: rows[0]?.id,
              lastId: rows[rows.length - 1]?.id,
              idSequenceLen: serialized.length,
            });
            return;
          }
          const prevSerialized = lastSerializedRef.current;
          lastSerializedRef.current = serialized;
          logMessageFlow("idb:hook rows applied", {
            iKey,
            chatKey,
            rowCount: rows.length,
            firstId: rows[0]?.id,
            lastId: rows[rows.length - 1]?.id,
            prevIdSequenceLen: prevSerialized.length,
            newIdSequenceLen: serialized.length,
          });
          setMessages(rows);
        })
        .catch((e) => {
          logMessageFlow("idb:hook read failed", { iKey, chatKey, error: String(e) });
          if (!cancelled) {
            lastSerializedRef.current = "";
            setMessages(EMPTY);
          }
        });
    };

    logMessageFlow("idb:hook subscribe", { iKey, chatKey, instanceId: currentInstanceId });
    load();
    const unsub = subscribeMessageCache(iKey, load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [context, currentInstanceId]);

  return messages;
}
