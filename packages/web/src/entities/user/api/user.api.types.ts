/**
 * Types for user API responses and the status-load orchestrator.
 */

import type { UserStatus } from "../user.model";

export interface ZulipApiResultEnvelope {
  result?: "success" | "error";
  msg?: string;
  code?: string;
}

export interface ZulipStatusEmojiDisplayInfo {
  emoji_name?: string;
  emoji_code?: string;
  reaction_type?: string;
}

export interface ZulipGetUserStatusPayload {
  status_text?: string;
  emoji_name?: string;
  emoji_code?: string;
  reaction_type?: string;
  away?: boolean;
}

export interface ZulipGetUserStatusResponse extends ZulipApiResultEnvelope {
  status?: ZulipGetUserStatusPayload | null;
}

export interface ZulipUpdateOwnStatusResponse extends ZulipApiResultEnvelope {
  status_text?: string;
  status_emoji?: string;
  away?: boolean;
  status_emoji_display_info?: ZulipStatusEmojiDisplayInfo | ZulipStatusEmojiDisplayInfo[] | null;
}

export type OwnStatusMutationErrorKind = "forbidden" | "invalid" | "unsupported" | "transient";

export type OwnStatusMutationResult =
  | { ok: true; status: UserStatus | null }
  | {
      ok: false;
      status: number;
      kind: OwnStatusMutationErrorKind;
      message: string;
      code?: string;
    };

export type StatusFetchOutcome =
  | { kind: "ok"; status: UserStatus | null }
  | { kind: "invalid_user"; status: null }
  | { kind: "transient_error"; status: null };

export type UserStatusRequestReason =
  | "bootstrap"
  | "dm_header"
  | "right_panel"
  | "top_bar"
  | "compat";

export type UserStatusRequestPriority = "high" | "low";

export interface RequestUserStatusOptions {
  /** Bypass TTL/backoff and enqueue immediately. */
  force?: boolean;
  /** Diagnostic tag for the request source (logging / TTL tuning). */
  reason?: UserStatusRequestReason;
  /** High-priority requests drain before low-priority background loads. */
  priority?: UserStatusRequestPriority;
}

export type FetchUserStatusDetailed = (userId: number) => Promise<StatusFetchOutcome>;
