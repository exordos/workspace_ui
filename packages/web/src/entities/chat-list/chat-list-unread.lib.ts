/**
 * Unread reconciliation facade for chat-list store delegation.
 *
 * Aggregates unread-related pure libs so the store imports a single module.
 */
export {
  applyReconcileUnreadMapsPatch as applyChatListUnreadReconcile,
  type ApplyReconcileUnreadMapsParams as ApplyChatListUnreadReconcileParams,
} from "./chat-list-unread-reconcile-apply.lib";
export { buildUnreadReconcileMapsFromRegisterSnapshot as buildUnreadReconcilePlan } from "./chat-list-unread-reconcile.lib";

export type UnreadReconcilePlan = ReturnType<
  typeof import("./chat-list-unread-reconcile.lib").buildUnreadReconcileMapsFromRegisterSnapshot
>;
