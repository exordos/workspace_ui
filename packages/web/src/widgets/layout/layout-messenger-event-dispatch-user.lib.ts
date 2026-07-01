/**
 * Workspace realtime user profile handlers.
 */
import { applyUserStatusAwayPreference } from "~/entities/user/user-status-away-preference.lib";
import type { MessengerEvent, MessengerUserMember } from "~/shared/api/messenger.types";
import { userIdsEqual } from "~/shared/lib/user-id.lib";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isMessengerUserMember(value: unknown): value is MessengerUserMember {
  return (
    isRecord(value) && (typeof value.user_id === "string" || typeof value.user_id === "number")
  );
}

export function handleUserUpdated(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "user" || event.kind !== "user.updated") return;
  const user = event.user;
  if (!isMessengerUserMember(user)) return;
  const currentUserId = ctx.chatList.currentUserId;
  const userWithLocalAway =
    currentUserId != null && userIdsEqual(user.user_id, currentUserId)
      ? applyUserStatusAwayPreference(user, currentUserId, ctx.currentInstanceId)
      : user;
  ctx.users.mergeUser(userWithLocalAway);
}
