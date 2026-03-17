/**
 * Message Readers API — fetches read receipts from Zulip.
 *
 * Zulip API: GET /messages/{id}/read_receipts → { user_ids: number[] }
 */

import { zulipApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { ReadReceiptsResponse } from "./message-readers.types";

const log = createLogger("message-readers:api");

export async function fetchReadReceipts(messageId: number): Promise<ReadReceiptsResponse> {
  guard.messageId(messageId, "fetchReadReceipts");

  const res = await zulipApi.get(`/messages/${messageId}/read_receipts`);

  if (!res.ok) {
    const msg = `Failed to fetch read receipts for message ${messageId}: HTTP ${res.status}`;
    log.error(msg);
    throw new Error(msg);
  }

  const data = res.data as ReadReceiptsResponse;
  log.info("Read receipts fetched", { messageId, count: data.user_ids.length });
  return data;
}
