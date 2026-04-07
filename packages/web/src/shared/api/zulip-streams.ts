/**
 * Zulip streams, subscriptions, topics, and stream admin API.
 */
import { guard } from "~/shared/lib/guards";
import { getClient } from "./zulip-client.internal";
import {
  zulipPipelineDelete,
  zulipPipelineGet,
  zulipPipelinePatch,
} from "./zulip-pipeline.internal";
import type { MockStream, ZulipSubscription } from "./zulip.types";

/** Fetches the user's subscriptions (GET /users/me/subscriptions) including is_muted per stream. */
export async function fetchSubscriptions(): Promise<ZulipSubscription[]> {
  const res = await zulipPipelineGet("/users/me/subscriptions");
  if (!res?.ok) {
    return [];
  }
  const data = res.data as {
    subscriptions?: {
      stream_id: number;
      name: string;
      is_muted?: boolean;
      in_home_view?: boolean;
    }[];
  };
  return (data.subscriptions ?? []).map((s) => ({
    stream_id: s.stream_id,
    name: s.name,
    is_muted: s.is_muted ?? !(s.in_home_view ?? true),
  }));
}

export async function fetchStreams(): Promise<MockStream[]> {
  const client = await getClient();
  const data = await client.streams.retrieve();
  const list = data.streams ?? [];
  return list.map((s) => ({
    stream_id: s.stream_id,
    name: s.name,
    description: s.description ?? "",
    is_announcement_only: false,
  }));
}

/** Fetches subscriber IDs for a stream (GET /streams/{stream_id}/members). */
export async function fetchStreamMembers(streamId: number): Promise<number[]> {
  guard.streamId(streamId, "fetchStreamMembers");
  const res = await zulipPipelineGet(`/streams/${streamId}/members`);
  if (!res?.ok) {
    return [];
  }
  const data = res.data as { result?: string; subscribers?: number[] };
  if (data.result === "error") return [];
  return data.subscribers ?? [];
}

export async function fetchTopics(stream: string): Promise<string[]> {
  const streamName = guard.nonEmpty(stream, "fetchTopics.stream");
  const client = await getClient();
  const streamsData = await client.streams.retrieve();
  const streamObj = (streamsData.streams ?? []).find((s) => s.name === streamName);
  if (!streamObj) return [];
  const data = await client.streams.topics.retrieve({ stream_id: streamObj.stream_id });
  return (data.topics ?? []).map((topic) => topic.name);
}

/** Updates stream metadata (PATCH /api/v1/streams/{stream_id}). */
export async function updateStream(
  streamId: number,
  params: { name?: string; description?: string },
): Promise<boolean> {
  guard.streamId(streamId, "updateStream.streamId");
  const body: Record<string, string> = {};
  const trimmedName = params.name?.trim();
  if (trimmedName != null && trimmedName.length > 0) {
    body.new_name = trimmedName;
  }
  if (params.description != null) {
    body.description = params.description.trim();
  }
  if (Object.keys(body).length === 0) {
    return true;
  }

  try {
    const res = await zulipPipelinePatch(`streams/${streamId}`, body);
    if (!res.ok) return false;
    const data = res.data as { result?: string };
    return data.result !== "error";
  } catch {
    return false;
  }
}

/** Deletes a stream (DELETE /api/v1/streams/{stream_id}). */
export async function deleteStream(streamId: number): Promise<boolean> {
  guard.streamId(streamId, "deleteStream.streamId");
  try {
    const res = await zulipPipelineDelete(`streams/${streamId}`);
    if (!res.ok) return false;
    const data = res.data as { result?: string };
    return data.result !== "error";
  } catch {
    return false;
  }
}
