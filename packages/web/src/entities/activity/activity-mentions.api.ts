import type { ActivityUnreadMention } from "~/entities/activity/activity.model";
import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "~/entities/messenger/messenger-request-options.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerClientOptions,
  type MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";

const log = createLogger("activity:mentions");
const DEFAULT_MENTIONS_PAGE_SIZE = 50;
const UNREAD_MENTIONS_PAGE_SIZE = 100;

export interface MyMentionsPageResult {
  messages: MessengerMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FetchMyMentionsPageOptions {
  runtimeContext: WorkspaceRuntimeContext;
  cursor?: string;
  pageSize?: number;
  signal?: AbortSignal;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: {
    getMessagesPage?: (
      options: MessengerClientOptions,
      query: {
        pageLimit: number;
        pageMarker?: string;
        mentioned: boolean;
        read?: boolean;
        sortKey: "created_at";
        sortDir: "desc";
      },
    ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  };
}

export interface FetchUnreadMentionsOptions {
  runtimeContext: WorkspaceRuntimeContext;
  signal?: AbortSignal;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: FetchMyMentionsPageOptions["client"];
}

export async function fetchMyMentionsPage({
  runtimeContext,
  cursor,
  pageSize = DEFAULT_MENTIONS_PAGE_SIZE,
  signal,
  clientOptions,
  client,
}: FetchMyMentionsPageOptions): Promise<MyMentionsPageResult> {
  const start = performance.now();
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    const page = await (client?.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, {
      pageLimit: pageSize,
      ...(cursor == null ? {} : { pageMarker: cursor }),
      mentioned: true,
      sortKey: "created_at",
      sortDir: "desc",
    });
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "workspace-messages-mentioned", {
      status: 200,
      durationMs,
    });
    return {
      messages: page.items.map(adaptMessengerMessage),
      nextCursor: page.nextPageMarker,
      hasMore: page.nextPageMarker != null,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const aborted = isAbortError(error) || signal?.aborted === true;
    logApiCall("GET", "workspace-messages-mentioned", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(error) }),
    });
    if (!aborted) {
      log.error("Failed to fetch Workspace mentions", { error: String(error) });
    }
    throw error;
  }
}

export async function fetchUnreadMentions({
  runtimeContext,
  signal,
  clientOptions,
  client,
}: FetchUnreadMentionsOptions): Promise<ActivityUnreadMention[]> {
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const getMessagesPage = client?.getMessagesPage ?? defaultGetMessagesPage;
  const mentions: ActivityUnreadMention[] = [];
  let pageMarker: string | undefined;

  do {
    const page = await getMessagesPage(requestOptions, {
      pageLimit: UNREAD_MENTIONS_PAGE_SIZE,
      ...(pageMarker == null ? {} : { pageMarker }),
      mentioned: true,
      read: false,
      sortKey: "created_at",
      sortDir: "desc",
    });
    mentions.push(
      ...page.items.map((message) => ({
        uuid: message.uuid,
        streamUuid: message.stream_uuid,
        topicUuid: message.topic_uuid,
        createdAt: message.created_at,
      })),
    );
    pageMarker = page.nextPageMarker ?? undefined;
  } while (pageMarker != null);

  return mentions;
}
