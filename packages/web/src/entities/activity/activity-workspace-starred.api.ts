import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "~/applications/messenger/model/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerClientOptions,
  type MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";

const log = createLogger("activity:workspace-starred");

export interface WorkspaceStarredMessagesPageResult {
  messages: WorkspaceMessengerMessageDto[];
  nextPageMarker: string | null;
  hasMore: boolean;
  pageLimit: number | null;
}

export interface FetchWorkspaceStarredMessagesOptions {
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
        starred?: boolean;
        sortKey?: "created_at";
        sortDir?: "asc" | "desc";
      },
    ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  };
}

export async function fetchWorkspaceStarredMessages({
  runtimeContext,
  pageLimit,
  pageMarker,
  signal,
  clientOptions,
  client,
}: FetchWorkspaceStarredMessagesOptions): Promise<WorkspaceStarredMessagesPageResult> {
  const start = performance.now();
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  try {
    const page = await (client?.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, {
      ...(pageLimit == null ? {} : { pageLimit }),
      ...(pageMarker == null ? {} : { pageMarker }),
      starred: true,
      sortKey: "created_at",
      sortDir: "desc",
    });
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "workspace-messages-starred", {
      status: 200,
      durationMs,
    });
    return {
      messages: page.items,
      nextPageMarker: page.nextPageMarker,
      hasMore: page.nextPageMarker != null,
      pageLimit: page.pageLimit,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const aborted = isAbortError(err) || signal?.aborted === true;
    logApiCall("GET", "workspace-messages-starred", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(err) }),
    });
    if (!aborted) {
      log.error("Failed to fetch Workspace starred messages", { error: String(err) });
    }
    throw err;
  }
}
