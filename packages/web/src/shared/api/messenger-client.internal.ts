/**
 * Messenger API REST client cache.
 * Internal module for shared/api and `messenger-*` modules.
 */
import { t } from "~/i18n/i18n";
import { getCurrentInstance } from "./client";
import { messengerPipelineGet } from "./messenger-pipeline.internal";
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
      page_limit?: number;
      page_marker?: string;
      sort_key?: "created_at";
      sort_dir?: "asc" | "desc";
      stream_uuid?: string;
      topic_uuid?: string;
      starred?: boolean;
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
  };
}

let clientCache: { instanceId: string; promise: Promise<WorkspaceClient> } | null = null;

export function buildMessagesQueryParams(params: {
  page_limit?: number;
  page_marker?: string;
  sort_key?: "created_at";
  sort_dir?: "asc" | "desc";
  stream_uuid?: string;
  topic_uuid?: string;
  starred?: boolean;
}): Record<string, string> {
  const query: Record<string, string> = {
    page_limit: String(Math.max(1, params.page_limit ?? 100)),
    sort_key: params.sort_key ?? "created_at",
    sort_dir: params.sort_dir ?? "desc",
  };
  if (params.page_marker != null && params.page_marker.trim().length > 0) {
    query.page_marker = params.page_marker.trim();
  }
  if (params.stream_uuid != null) {
    query.stream_uuid = params.stream_uuid;
  }
  if (params.topic_uuid != null) {
    query.topic_uuid = params.topic_uuid;
  }
  if (params.starred != null) {
    query.starred = params.starred ? "true" : "false";
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
        const res = await messengerPipelineGet("/messages/", buildMessagesQueryParams(params));
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
