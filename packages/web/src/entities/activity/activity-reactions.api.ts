import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "~/entities/messenger/messenger-request-options.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getReactionActivityMessagesPage as defaultGetReactionActivityMessagesPage,
  type MessengerClientOptions,
  type MessengerCollectionPage,
  type MessengerPaginationQuery,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";

const log = createLogger("activity:reactions");
const DEFAULT_REACTION_ACTIVITY_PAGE_SIZE = 50;

export interface MyReactionActivityPageResult {
  messages: MessengerMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FetchMyReactionActivityPageOptions {
  runtimeContext: WorkspaceRuntimeContext;
  cursor?: string;
  pageSize?: number;
  signal?: AbortSignal;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: {
    getReactionActivityMessagesPage?: (
      options: MessengerClientOptions,
      query: MessengerPaginationQuery,
    ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  };
}

export async function fetchMyReactionActivityPage({
  runtimeContext,
  cursor,
  pageSize = DEFAULT_REACTION_ACTIVITY_PAGE_SIZE,
  signal,
  clientOptions,
  client,
}: FetchMyReactionActivityPageOptions): Promise<MyReactionActivityPageResult> {
  const start = performance.now();
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    const page = await (
      client?.getReactionActivityMessagesPage ?? defaultGetReactionActivityMessagesPage
    )(requestOptions, {
      pageLimit: pageSize,
      ...(cursor == null ? {} : { pageMarker: cursor }),
    });
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "workspace-reaction-activity", {
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
    logApiCall("GET", "workspace-reaction-activity", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(error) }),
    });
    if (!aborted) {
      log.error("Failed to fetch Workspace reaction activity", { error: String(error) });
    }
    throw error;
  }
}
