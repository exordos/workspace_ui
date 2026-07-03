import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "~/entities/messenger/messenger-request-options.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerCollectionPage,
  type MessengerClientOptions,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";

const log = createLogger("feed:api");

export interface FeedMessagesPageResult {
  messages: MessengerMessage[];
  nextPageMarker: string | null;
  hasMore: boolean;
  pageLimit: number | null;
}

export interface FetchFeedMessagesOptions {
  runtimeContext: WorkspaceRuntimeContext;
  pageLimit?: number;
  pageMarker?: string;
  signal?: AbortSignal;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: {
    getMessagesPage?: (
      options: MessengerClientOptions,
      query: {
        pageLimit?: number;
        pageMarker?: string;
      },
    ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  };
}

export async function fetchFeedMessages({
  runtimeContext,
  pageLimit = 50,
  pageMarker,
  signal,
  clientOptions,
  client,
}: FetchFeedMessagesOptions): Promise<FeedMessagesPageResult> {
  const start = performance.now();
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  try {
    const page = await (client?.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, {
      pageLimit,
      pageMarker,
    });
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages/", {
      status: 200,
      durationMs,
    });
    return {
      messages: page.items.map(adaptMessengerMessage),
      nextPageMarker: page.nextPageMarker,
      hasMore: page.nextPageMarker != null,
      pageLimit: page.pageLimit,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const aborted = isAbortError(err) || signal?.aborted === true;
    logApiCall("GET", "/messages/", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(err) }),
    });
    if (!aborted) {
      log.error("Failed to fetch feed messages", { error: String(err) });
    }
    throw err;
  }
}

export function hydrateFeedMessagesFromCache(
  _ownerKey: string | null,
  _limit = 200,
): Promise<MessengerMessage[]> {
  return Promise.resolve([]);
}
