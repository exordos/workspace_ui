import type { UserId } from "~/shared/lib/user-id.lib";

/**
 * Chat/DM/Channel info panel types.
 *
 * A single model handles both DM info and channel info — the `type`
 * field distinguishes which variant is loaded. This keeps the info
 * panel logic unified while supporting both chat kinds.
 */

export interface ChatInfoMember {
  userId: UserId;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  /** Workspace custom profile fields (from GET /users). */
  profileData?: Record<string, { value?: string; rendered_value?: string }>;
}

export interface ChatInfoTopic {
  name: string;
  topicUuid?: string;
  unreadCount: number;
  isDone?: boolean;
}

export type ChatInfoContext =
  | {
      kind: "none";
      instanceId: string | null;
    }
  | {
      kind: "dm";
      instanceId: string;
      dmName: string;
      participantIds: UserId[];
    }
  | {
      kind: "stream";
      instanceId: string;
      streamUuid: string;
      streamName: string;
      isMuted: boolean;
      topics: ChatInfoTopic[];
    };

export interface ChatInfoData {
  /** Discriminant: "dm" for direct messages, "stream" for channels/topics. */
  type: "dm" | "stream";
  /** Display name (channel name or DM partner name). */
  name: string;
  /** Total member count. */
  memberCount: number;
  /** Currently online members. */
  onlineCount: number;
  /** Member list (may be partial for large channels). */
  members: ChatInfoMember[];
  /** Channel description (streams only). */
  description: string | null;
  /** Stream topics with unread counters (streams only). */
  topics?: ChatInfoTopic[];
  /** Whether notifications are muted. */
  isMuted: boolean;
}
