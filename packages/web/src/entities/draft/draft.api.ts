/**
 * Draft API — Zulip Drafts endpoints.
 *
 * GET /drafts — fetch all drafts
 * POST /drafts — create draft(s)
 * PATCH /drafts/{id} — update a draft
 * DELETE /drafts/{id} — delete a draft
 */

import { zulipApi } from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type { Draft, DraftInput } from "./draft.types";

const log = createLogger("draft:api");

export async function fetchDrafts(): Promise<Draft[]> {
  try {
    const res = await zulipApi.get("/drafts");
    if (!res.ok) {
      log.warn("Fetch drafts failed", { status: res.status });
      throw new Error(`Fetch drafts failed with status ${res.status}`);
    }
    const data = res.data as {
      drafts?: {
        id: number;
        type: string;
        to: number[];
        topic: string;
        content: string;
        timestamp: number;
      }[];
    };
    return (data.drafts ?? []).map((d) => ({
      id: d.id,
      type: d.type === "private" ? "private" : "stream",
      to: d.to,
      topic: d.topic ?? "",
      content: d.content,
      timestamp: d.timestamp,
    }));
  } catch (err) {
    log.error("Fetch drafts error", { error: String(err) });
    throw err;
  }
}

export async function createDraft(input: DraftInput): Promise<number | null> {
  guard.oneOf(input.type, ["stream", "private"] as const, "draft type");
  guard.nonEmptyArray(input.to, "draft to (stream ID or recipient IDs)");
  for (const id of input.to) {
    if (input.type === "stream") {
      guard.streamId(id, "createDraft to");
    } else {
      guard.userId(id, "createDraft to");
    }
  }

  try {
    const res = await zulipApi.post("/drafts", {
      drafts: JSON.stringify([
        {
          type: input.type,
          to: input.to,
          topic: input.topic,
          content: input.content,
        },
      ]),
    });
    if (!res.ok) {
      log.warn("Create draft failed", { status: res.status });
      return null;
    }
    const data = res.data as { ids?: number[] };
    return data.ids?.[0] ?? null;
  } catch (err) {
    log.error("Create draft error", { error: String(err) });
    return null;
  }
}

export async function updateDraftOnServer(id: number, input: DraftInput): Promise<boolean> {
  guard.messageId(id, "updateDraftOnServer");
  guard.oneOf(input.type, ["stream", "private"] as const, "draft type");
  guard.nonEmptyArray(input.to, "draft to");
  for (const uid of input.to) {
    if (input.type === "stream") {
      guard.streamId(uid, "updateDraftOnServer to");
    } else {
      guard.userId(uid, "updateDraftOnServer to");
    }
  }

  try {
    const res = await zulipApi.patch(`/drafts/${id}`, {
      draft: JSON.stringify({
        type: input.type,
        to: input.to,
        topic: input.topic,
        content: input.content,
      }),
    });
    return res.ok;
  } catch (err) {
    log.error("Update draft error", { id, error: String(err) });
    return false;
  }
}

export async function deleteDraftOnServer(id: number): Promise<boolean> {
  guard.messageId(id, "deleteDraftOnServer");

  try {
    const res = await zulipApi.delete(`/drafts/${id}`);
    return res.ok;
  } catch (err) {
    log.error("Delete draft error", { id, error: String(err) });
    return false;
  }
}
