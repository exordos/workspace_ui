import {
  messengerRequestJsonResult,
  paginationParams,
  parseDto,
  parsePaginationHeaders,
  parseStrictDtoList,
} from "./messenger-transport.internal";
import { isWorkspaceMessengerDraftDto } from "./messenger.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
} from "./messenger-transport.internal";
import type {
  WorkspaceMessengerCreateDraftRequestBody,
  WorkspaceMessengerDraftDto,
  WorkspaceMessengerUpdateDraftRequestBody,
} from "./messenger.types";

export interface GetDraftsQuery extends MessengerPaginationQuery {
  streamUuid?: string;
  topicUuid?: string;
  sortKey?: "updated_at";
  sortDir?: "asc" | "desc";
}

export interface WorkspaceMessengerDraftSnapshot {
  draft: WorkspaceMessengerDraftDto;
  etag: string;
}

function draftEtag(draft: WorkspaceMessengerDraftDto, headers: Headers): string {
  return headers.get("ETag") ?? `"${draft.revision}"`;
}

function draftsQueryParams(query: GetDraftsQuery) {
  return {
    ...paginationParams(query),
    stream_uuid: query.streamUuid,
    topic_uuid: query.topicUuid,
    sort_key: query.sortKey,
    sort_dir: query.sortDir,
  };
}

export async function getDraftsPage(
  options: MessengerClientOptions,
  query: GetDraftsQuery = {},
): Promise<MessengerCollectionPage<WorkspaceMessengerDraftSnapshot>> {
  const { data, headers } = await messengerRequestJsonResult(
    "GET",
    "/drafts/",
    options,
    draftsQueryParams(query),
  );
  const items = parseStrictDtoList(data, isWorkspaceMessengerDraftDto, "messenger drafts response");
  return {
    items: items.map((draft) => ({ draft, etag: draftEtag(draft, headers) })),
    ...parsePaginationHeaders(headers),
  };
}

export async function createDraft(
  options: MessengerClientOptions,
  body: WorkspaceMessengerCreateDraftRequestBody,
): Promise<WorkspaceMessengerDraftSnapshot> {
  const { data, headers } = await messengerRequestJsonResult("POST", "/drafts/", options, {}, body);
  const draft = parseDto(data, isWorkspaceMessengerDraftDto, "messenger draft response");
  return { draft, etag: draftEtag(draft, headers) };
}

export async function updateDraft(
  options: MessengerClientOptions,
  draftUuid: string,
  body: WorkspaceMessengerUpdateDraftRequestBody,
  etag: string,
): Promise<WorkspaceMessengerDraftSnapshot> {
  const { data, headers } = await messengerRequestJsonResult(
    "PUT",
    `/drafts/${draftUuid}`,
    options,
    {},
    body,
    { "If-Match": etag },
  );
  const draft = parseDto(data, isWorkspaceMessengerDraftDto, "messenger draft response");
  return { draft, etag: draftEtag(draft, headers) };
}

export async function deleteDraft(
  options: MessengerClientOptions,
  draftUuid: string,
  etag: string,
): Promise<void> {
  await messengerRequestJsonResult("DELETE", `/drafts/${draftUuid}`, options, {}, undefined, {
    "If-Match": etag,
  });
}
