/**
 * zulip-js client cache and session-backed client.
 * Internal module for shared/api and `zulip-*` modules.
 */
import { Buffer } from "buffer";
import zulipInitDefault from "zulip-js";
import { t } from "~/i18n/i18n";
import { getCurrentInstance } from "./client";
import { zulipPipelineGet, zulipPipelinePost } from "./zulip-pipeline.internal";
import { normalizeRealm as normalizeRealmUrl } from "./zulip-realm.internal";

if (typeof (globalThis as unknown as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const zulipInit = zulipInitDefault as unknown as (config: {
  realm: string;
  username: string;
  apiKey: string;
}) => Promise<{
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
}>;

export type ZulipClient = Awaited<ReturnType<typeof zulipInit>>;

let clientCache: { instanceId: string; promise: Promise<ZulipClient> } | null = null;

type SessionAuthInstance = NonNullable<ReturnType<typeof getCurrentInstance>> & {
  authType: "session";
};

function isSessionAuthInstance(
  instance: ReturnType<typeof getCurrentInstance>,
): instance is SessionAuthInstance {
  return instance?.authType === "session";
}

export function buildMessagesQueryParams(params: {
  narrow?: unknown;
  anchor?: string | number;
  num_before?: number;
  num_after?: number;
}): Record<string, string> {
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
}

function createSessionClient(): Promise<ZulipClient> {
  const sessionClient: ZulipClient = {
    streams: {
      retrieve: async () => {
        const res = await zulipPipelineGet("/streams");
        if (!res?.ok) {
          return { streams: [] };
        }
        const data = res.data as {
          result?: string;
          streams?: { stream_id: number; name: string; description?: string }[];
        };
        if (data.result === "error") {
          return { streams: [] };
        }
        return {
          streams: data.streams ?? [],
        };
      },
      topics: {
        retrieve: async (params: { stream_id: number }) => {
          const res = await zulipPipelineGet(`/users/me/${params.stream_id}/topics`);
          if (!res?.ok) {
            return { topics: [] };
          }
          const data = res.data as {
            result?: string;
            topics?: { name?: string }[];
          };
          if (data.result === "error") {
            return { topics: [] };
          }
          return {
            topics: (data.topics ?? []).map((topic) => ({ name: topic.name ?? "" })),
          };
        },
      },
    },
    messages: {
      retrieve: async (params) => {
        const res = await zulipPipelineGet("/messages", buildMessagesQueryParams(params));
        if (!res?.ok) {
          return { result: "error", messages: [] };
        }
        const data = res.data as {
          result?: string;
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
        };
        return {
          result: data.result,
          messages: data.messages ?? [],
        };
      },
      send: async (params) => {
        const body: Record<string, string> = {
          type: params.type,
          content: params.content,
        };
        if (params.type === "private") {
          const recipients = Array.isArray(params.to) ? params.to : [params.to];
          body.to = JSON.stringify(recipients);
        } else {
          body.to = String(params.to);
          if (params.topic != null) {
            body.topic = params.topic;
          }
        }
        const response = await zulipPipelinePost("/messages", body);
        const data = response.data as {
          result?: string;
          msg?: string;
          id?: number;
        };
        if (!response.ok || data.result === "error") {
          throw new Error(data.msg ?? t("app.unknownError"));
        }
        return { id: data.id };
      },
    },
  };
  return Promise.resolve(sessionClient);
}

export function getClient(): Promise<ZulipClient> {
  const instance = getCurrentInstance();
  if (!instance) {
    return Promise.reject(new Error(t("app.noInstance")));
  }
  if (clientCache?.instanceId === instance.id) {
    return clientCache.promise;
  }
  if (isSessionAuthInstance(instance)) {
    const promise = createSessionClient();
    clientCache = { instanceId: instance.id, promise };
    return promise;
  }
  const realm = instance.realm.replace(/\/api\/v1$/, "").replace(/\/+$/, "") || instance.realm;
  const promise = zulipInit({
    realm,
    username: instance.email,
    apiKey: instance.apiKey,
  });
  clientCache = { instanceId: instance.id, promise };
  return promise;
}

/** Realm base URL without API path (avatars, uploads). */
export function getRealmBaseUrl(): string {
  const instance = getCurrentInstance();
  if (!instance) return "";
  return normalizeRealmUrl(instance.realm);
}

export { normalizeRealm } from "./zulip-realm.internal";
