/**
 * Realm URL helpers for legacy media/avatar surfaces.
 * Internal module for shared/api and `zulip-*` modules.
 */
import { getCurrentInstance } from "./client";
import { normalizeRealm as normalizeRealmUrl } from "./zulip-realm.internal";

export interface ZulipClient {
  streams: {
    retrieve: (
      params?: Record<string, unknown>,
    ) => Promise<{ streams?: { stream_id: number; name: string; description?: string }[] }>;
    topics: {
      retrieve: (params: { stream_id: number }) => Promise<{ topics?: { name: string }[] }>;
    };
  };
  messages: {
    retrieve: (params: {
      narrow?: { operator: string; operand: string | number | number[] }[];
      anchor?: string | number;
      num_before?: number;
      num_after?: number;
      include_anchor?: boolean;
      client_gravatar?: boolean;
      allow_empty_topic_name?: boolean;
      apply_markdown?: boolean;
    }) => Promise<{
      messages?: {
        id: number;
        sender_id: number;
        sender_full_name?: string;
        content: string;
        timestamp: number;
        display_recipient?: string;
        subject?: string;
        type?: string;
        stream_id?: number | null;
      }[];
    }>;
    send: (params: {
      type: string;
      to: string | number[];
      topic?: string;
      content: string;
    }) => Promise<{ id?: number }>;
  };
}

function createDisabledZulipClient(): ZulipClient {
  return {
    streams: {
      retrieve: () => Promise.resolve({ streams: [] }),
      topics: {
        retrieve: () => Promise.resolve({ topics: [] }),
      },
    },
    messages: {
      retrieve: () => Promise.resolve({ messages: [] }),
      send: () => Promise.reject(new Error("Legacy Zulip client is disabled")),
    },
  };
}

export const buildMessagesQueryParams = (params: {
  narrow?: unknown;
  anchor?: string | number;
  num_before?: number;
  num_after?: number;
}): Record<string, string> => {
  const query: Record<string, string> = {
    anchor: String(params.anchor ?? "newest"),
    num_before: String(params.num_before ?? 100),
    num_after: String(params.num_after ?? 0),
    allow_empty_topic_name: "true",
    client_gravatar: "true",
    apply_markdown: "false",
  };
  if (params.narrow != null) {
    query.narrow = JSON.stringify(params.narrow);
  }
  return query;
};

export const getClient: () => Promise<ZulipClient> = () =>
  Promise.resolve(createDisabledZulipClient());

/** Realm base URL without API path (avatars, uploads). */
export function getRealmBaseUrl(): string {
  const instance = getCurrentInstance();
  if (!instance) return "";
  return normalizeRealmUrl(instance.realm);
}

export { normalizeRealm } from "./zulip-realm.internal";
