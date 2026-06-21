import type { DraftType } from "~/entities/draft/draft.types";
import { t } from "~/i18n/i18n";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { type UserId } from "~/shared/lib/user-id.lib";

export type ReadFallbackContext =
  | { type: "stream"; streamId: string; topic: string }
  | { type: "dm"; dmKey: string };

export function resolveDraftType(
  isDmView: boolean,
  activeStream: string | null | undefined,
): DraftType | null {
  if (isDmView) {
    return "private";
  }
  if (activeStream) {
    return "stream";
  }
  return null;
}

export function buildReadFallbackContext(options: {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null | undefined;
  currentUserId: UserId | null | undefined;
  activeStreamId: string | null | undefined;
  activeTopic: string | null | undefined;
}): ReadFallbackContext | undefined {
  if (options.isDmView) {
    if (options.activeDmUserIds == null || options.activeDmUserIds.length === 0) {
      return undefined;
    }
    return {
      type: "dm",
      dmKey: dmRouteKey(options.activeDmUserIds, options.currentUserId ?? null),
    };
  }
  if (options.activeStreamId == null) {
    return undefined;
  }
  return {
    type: "stream",
    streamId: options.activeStreamId,
    topic: options.activeTopic ?? "",
  };
}

export function resolveChatHeaderRightPanelLabel(isDmView: boolean): string | undefined {
  if (isDmView) {
    return t("info.partnerInfo");
  }
  return undefined;
}

export function resolveMessageListScrollKey(options: {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStream: string | null | undefined;
  activeTopic: string | null | undefined;
}): string | undefined {
  if (options.isDmView) {
    return options.activeDmUserIds !== null ? `dm-${options.activeDmUserIds.join(",")}` : undefined;
  }
  return [options.activeStream ?? "", options.activeTopic ?? ""].join("|");
}
