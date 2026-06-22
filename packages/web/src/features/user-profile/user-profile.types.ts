/**
 * User profile type definitions.
 */

import type { UserStatus } from "~/entities/user/user.model";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface UserProfileData {
  userId: UserId;
  fullName: string;
  email?: string;
  avatarUrl?: string | null;
  role?: number;
  isBot?: boolean;
  isActive?: boolean;
  dateJoined?: string;
  jobTitle?: string;
  manager?: string;
  birthday?: string;
  localTime?: string;
  phone?: string;
  timezone?: string;
}

export type OwnStatusData = UserStatus;

export type OwnProfileUpdateErrorKind = "forbidden" | "invalid" | "unsupported" | "transient";

export type OwnProfileUpdateResult =
  | { ok: true }
  | {
      ok: false;
      kind: OwnProfileUpdateErrorKind;
      message: string;
    };

export interface OwnAvatarCapabilities {
  maxAvatarFileSizeMib: number;
  avatarChangesDisabled: boolean;
}

export type OwnAvatarMutationErrorKind = "forbidden" | "invalid" | "unsupported" | "transient";

export type OwnAvatarMutationResult =
  | {
      ok: true;
      avatarUrl: string | null;
    }
  | {
      ok: false;
      kind: OwnAvatarMutationErrorKind;
      message: string;
    };
