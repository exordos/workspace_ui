/**
 * Chat info store — unified DM/channel info panel state.
 *
 * Holds the currently displayed chat info data (member list, counts,
 * description, mute status). The `type` field on ChatInfoData
 * distinguishes between DM and stream info.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { ChatInfoData } from "./chat-info.types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ChatInfoState {
  data: ChatInfoData | null;
  loading: boolean;
  error: string | null;

  setData: (data: ChatInfoData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  clear: () => void;
}

export const useChatInfoStore = create<ChatInfoState>((set) => ({
  data: null,
  loading: false,
  error: null,

  setData(data) {
    logStoreAction("chatInfo", "setData", { type: data.type, name: data.name });
    set({ data, loading: false, error: null });
  },

  setLoading(loading) {
    set({ loading });
  },

  setError(error) {
    logStoreAction("chatInfo", "setError", { error });
    set({ error, loading: false });
  },

  clear() {
    logStoreAction("chatInfo", "clear");
    set({ data: null, loading: false, error: null });
  },
}));
