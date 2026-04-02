import { useMemo } from "react";
import type { Location } from "react-router-dom";
import { dmRouteKey } from "~/shared/lib/dm-key";
import {
  getDmById,
  parseDmSlugToUserIds,
  parseStreamSlug,
  resolveStreamRouteFromSlug,
} from "~/widgets/sidebar/sidebar.lib";
import { computeIsGroupDmView, normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";

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

  const { resolvedStreamName, resolvedStreamId } = useMemo(
    () => resolveStreamRouteFromSlug(parsedStream, streamsMap),
    [parsedStream, streamsMap],
  );

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
    isDmView && computeIsGroupDmView(dmChat, dmRecipientIds, currentUserId);
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

