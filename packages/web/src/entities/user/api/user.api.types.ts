/**
 * Types for the backend-only user API facade.
 */

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
