/**
 * Create chat type definitions.
 *
 * Supports:
 * 1. New DM — send a message to a user by ID
 * 2. New group DM — send a message to multiple users
 * 3. New channel — create a stream with name, description, subscribers
 */

export type NewChatType = "dm" | "group" | "channel";

export interface CreateDmParams {
  type: "dm";
  userId: number;
}

export interface CreateGroupParams {
  type: "group";
  userIds: number[];
}

export interface CreateChannelParams {
  type: "channel";
  name: string;
  description?: string;
  subscribers: number[];
  inviteOnly?: boolean;
  announce?: boolean;
}

export type CreateChatParams = CreateDmParams | CreateGroupParams | CreateChannelParams;

export interface UserSearchResult {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
}
