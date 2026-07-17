/** Workspace messenger draft API and client-state types. */

export interface DraftPayload extends Record<string, unknown> {
  kind: "markdown";
  content: string;
}

/** Server-owned draft snapshot. UUID is client-generated and stable across retries. */
export interface Draft {
  uuid: string;
  project_id: string;
  user_uuid: string;
  stream_uuid: string;
  topic_uuid: string;
  payload: DraftPayload;
  revision: number;
  created_at: string;
  updated_at: string;
  /** Entity tag used by conditional PUT/DELETE. Derived from revision when list responses omit it. */
  etag: string;
  /** Local-only state; never serialized to the API. */
  sync_state?: "synced" | "pending" | "conflict";
}

export interface DraftCreateInput {
  uuid: string;
  stream_uuid: string;
  topic_uuid: string;
  payload: DraftPayload;
}

export interface DraftUpdateInput {
  payload: DraftPayload;
}

export interface DraftListFilters {
  streamUuid?: string;
  topicUuid?: string;
  pageMarker?: string;
  pageLimit?: number;
}

export interface DraftPage {
  drafts: Draft[];
  nextPageMarker: string | null;
}

export interface DraftConflictSnapshot {
  draft: Draft | null;
  etag: string | null;
}
