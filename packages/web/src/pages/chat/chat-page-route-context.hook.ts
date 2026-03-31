import { useMemo } from "react";
import type { Location } from "react-router-dom";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { getDmById, parseDmSlugToUserIds, parseStreamSlug } from "~/widgets/sidebar";
import { normalizeDmRouteUserIds } from "./chat-dm-route.lib";

function parsePositiveIntFromSearch(location: Location, key: string): number | null {
  const raw = new URLSearchParams(location.search).get(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function useChatRouteContext(options: {
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
  location: Location;
  streamsMap: Map<number, { name: string }>;
  dmsFromStore: unknown[];
  currentUserId: number | null;
}): {
  activeTopic: string | undefined;
  streamRouteTopic: string;
  activeStream: string | undefined;
  resolvedStreamName: string;
  resolvedStreamId: number | null;
  dmRecipientIds: number[];
  isDmView: boolean;
  dmChat: ReturnType<typeof getDmById> | undefined;
  isGroupDmView: boolean;
  partnerUserId: number | null;
  dmKey: string | null;
  focusedMessageId: number | null;
  forwardMessageId: number | null;
} {
  const { streamSlug, topicName, dmIdParam, location, streamsMap, dmsFromStore, currentUserId } =
    options;

  const activeTopic = topicName ?? undefined;
  const parsedStream = useMemo(() => (streamSlug ? parseStreamSlug(streamSlug) : null), [streamSlug]);

  const resolvedStreamName = useMemo(() => {
    if (!parsedStream) return "";
    if (parsedStream.stream_id != null) {
      return streamsMap.get(parsedStream.stream_id)?.name ?? parsedStream.stream_name;
    }
    return parsedStream.stream_name;
  }, [parsedStream, streamsMap]);

  const resolvedStreamId = useMemo(() => {
    if (!parsedStream) return null;
    if (parsedStream.stream_id != null) return parsedStream.stream_id;
    if (!resolvedStreamName) return null;
    return (
      Array.from(streamsMap.entries()).find(([, stream]) => stream.name === resolvedStreamName)?.[0] ??
      null
    );
  }, [parsedStream, resolvedStreamName, streamsMap]);

  const streamRouteTopic = topicName ?? "general";
  const activeStream = parsedStream ? resolvedStreamName : undefined;

  const rawDmUserIds = useMemo(() => {
    if (dmIdParam == null || dmIdParam === "") return null;
    return parseDmSlugToUserIds(dmIdParam);
  }, [dmIdParam]);

  const activeDmUserIds = useMemo(
    () => (rawDmUserIds == null ? null : normalizeDmRouteUserIds(rawDmUserIds, currentUserId)),
    [rawDmUserIds, currentUserId],
  );

  const dmRecipientIds = activeDmUserIds ?? [];
  const isDmView = dmRecipientIds.length > 0;

  const dmChat = useMemo(
    () => (dmIdParam != null && dmIdParam !== "" ? getDmById(dmIdParam, dmsFromStore as never) : undefined),
    [dmIdParam, dmsFromStore],
  );

  const isGroupDmView =
    isDmView &&
    ((dmChat as { isGroup?: boolean } | undefined)?.isGroup ?? dmRecipientIds.length > 1);
  const partnerUserId =
    isDmView && !isGroupDmView && dmRecipientIds.length > 0 ? dmRecipientIds[0] ?? null : null;

  const dmKey = useMemo(() => {
    if (!isDmView || currentUserId == null) return null;
    return dmRouteKey(dmRecipientIds, currentUserId);
  }, [dmRecipientIds, isDmView, currentUserId]);

  const focusedMessageId = useMemo(() => parsePositiveIntFromSearch(location, "msg"), [location]);
  const forwardMessageId = useMemo(() => parsePositiveIntFromSearch(location, "forward"), [location]);

  return {
    activeTopic,
    streamRouteTopic,
    activeStream,
    resolvedStreamName,
    resolvedStreamId,
    dmRecipientIds,
    isDmView,
    dmChat,
    isGroupDmView,
    partnerUserId,
    dmKey,
    focusedMessageId,
    forwardMessageId,
  };
}

