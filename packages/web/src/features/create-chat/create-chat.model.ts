/**
 * Create chat store — manages the new DM / group / channel creation flow.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { NewChatType } from "./create-chat.types";

export type CreateChatStatus = "idle" | "creating" | "success" | "error";

interface CreateChatState {
  status: CreateChatStatus;
  chatType: NewChatType;
  selectedUserIds: number[];
  searchQuery: string;
  channelName: string;
  channelDescription: string;
  inviteOnly: boolean;
  error: string | null;

  setChatType: (type: NewChatType) => void;
  toggleUser: (userId: number) => void;
  clearSelection: () => void;
  setSearchQuery: (query: string) => void;
  setChannelName: (name: string) => void;
  setChannelDescription: (desc: string) => void;
  setInviteOnly: (inviteOnly: boolean) => void;
  setStatus: (status: CreateChatStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const INITIAL: Omit<
  CreateChatState,
  | "setChatType"
  | "toggleUser"
  | "clearSelection"
  | "setSearchQuery"
  | "setChannelName"
  | "setChannelDescription"
  | "setInviteOnly"
  | "setStatus"
  | "setError"
  | "reset"
> = {
  status: "idle",
  chatType: "dm",
  selectedUserIds: [],
  searchQuery: "",
  channelName: "",
  channelDescription: "",
  inviteOnly: false,
  error: null,
};

export const useCreateChatStore = create<CreateChatState>((set) => ({
  ...INITIAL,

  setChatType(type) {
    set({ chatType: type });
  },

  toggleUser(userId) {
    set((s) => {
      const idx = s.selectedUserIds.indexOf(userId);
      if (idx >= 0) {
        return { selectedUserIds: s.selectedUserIds.filter((id) => id !== userId) };
      }
      return { selectedUserIds: [...s.selectedUserIds, userId] };
    });
  },

  clearSelection() {
    set({ selectedUserIds: [] });
  },

  setSearchQuery(query) {
    set({ searchQuery: query });
  },

  setChannelName(name) {
    set({ channelName: name });
  },

  setChannelDescription(desc) {
    set({ channelDescription: desc });
  },

  setInviteOnly(inviteOnly) {
    set({ inviteOnly });
  },

  setStatus(status) {
    set({ status });
  },

  setError(error) {
    set({ error });
  },

  reset() {
    logStoreAction("create-chat", "reset", {});
    set({ ...INITIAL });
  },
}));
