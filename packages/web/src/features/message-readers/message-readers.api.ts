/**
 * Message Readers API facade.
 *
 * The Workspace gateway backend does not expose a read-receipts endpoint. The feature degrades
 * to an empty reader list without
 * network calls.
 */

import { guard } from "~/shared/lib/guards";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { ReadReceiptsResponse } from "./message-readers.types";

export async function fetchReadReceipts(
  messageId: MessageId,
  _options?: { signal?: AbortSignal },
): Promise<ReadReceiptsResponse> {
  guard.messageId(messageId, "fetchReadReceipts");
  return { user_ids: [] };
}
