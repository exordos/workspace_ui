/**
 * Types for the backend-only user API facade.
 */

import type { ActiveOrgRequestContext } from "~/entities/instance/instance.model";
import type { UserStatus } from "../user.model";

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

export type UserStatusRequestReason = "bootstrap" | "dm_header" | "right_panel" | "top_bar";

export type UserStatusRequestPriority = "high" | "low";

export interface RequestUserStatusOptions {
  /** Keep the old call shape while status hydration is owned by backend user payloads. */
  force?: boolean;
  /** Diagnostic tag for the UI source. */
  reason?: UserStatusRequestReason;
  /** Diagnostic priority for UI callers. */
  priority?: UserStatusRequestPriority;
  /** Active-organization context captured at request start. */
  orgContext?: ActiveOrgRequestContext;
  /** Instance ID captured at request start. */
  instanceId?: string;
}
