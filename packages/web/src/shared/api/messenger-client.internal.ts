/**
 * Messenger API REST client cache.
 * Internal module for shared/api and `messenger-*` modules.
 */
import { t } from "~/i18n/i18n";
import type { MessengerMessagesNarrowClause } from "~/shared/lib/messenger-topic-narrow.lib";
import { getCurrentInstance } from "./client";
import { messengerPipelineGet, messengerPipelinePost } from "./messenger-pipeline.internal";
import { normalizeRealm as normalizeRealmUrl } from "./messenger-realm.internal";

export interface WorkspaceClient {
  streams: {
    retrieve: (
      params?: Record<string, unknown>,
    ) => Promise<{ streams?: { stream_uuid: string; name: string; description?: string }[] }>;
    topics: {
      retrieve: (params: { stream_uuid: string }) => Promise<{ topics?: { name: string }[] }>;
    };
  };
  messages: {
    retrieve: (params: {
      narrow?: MessengerMessagesNarrowClause[];
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
        stream_uuid?: string | null;
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

let clientCache: { instanceId: string; promise: Promise<WorkspaceClient> } | null = null;

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

function createRestClient(): Promise<WorkspaceClient> {
  const restClient: WorkspaceClient = {
    streams: {
      retrieve: async () => {
        const res = await messengerPipelineGet("/streams");
        if (!res?.ok) {
          return { streams: [] };
        }
        const data = res.data as {
          result?: string;
          streams?: { stream_uuid: string; name: string; description?: string }[];
        };
        if (data.result === "error") {
          return { streams: [] };
        }
        return {
          streams: data.streams ?? [],
        };
      },
      topics: {
        retrieve: async (params: { stream_uuid: string }) => {
          const res = await messengerPipelineGet(`/stream_topics/`, {
            stream_uuid: params.stream_uuid,
          });
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
        const res = await messengerPipelineGet("/messages", buildMessagesQueryParams(params));
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
            stream_uuid?: string | null;
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
        const response = await messengerPipelinePost("/messages", body);
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
  return Promise.resolve(restClient);
}

export function getClient(): Promise<WorkspaceClient> {
  const instance = getCurrentInstance();
  if (!instance) {
    return Promise.reject(new Error(t("app.noInstance")));
  }
  if (clientCache?.instanceId === instance.id) {
    return clientCache.promise;
  }
  const promise = createRestClient();
  clientCache = { instanceId: instance.id, promise };
  return promise;
}

/** Realm base URL without API path (avatars, uploads). */
export function getRealmBaseUrl(): string {
  const instance = getCurrentInstance();
  if (!instance) return "";
  return normalizeRealmUrl(instance.realm);
}

export { normalizeRealm } from "./messenger-realm.internal";
