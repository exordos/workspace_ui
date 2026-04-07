import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { MockMessage } from "~/shared/api/zulip.types";

interface SearchModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
  openModal: () => void;
  closeModal: () => void;

  query: string;
  setQuery: (query: string) => void;

  streamFilter: string;
  setStreamFilter: (value: string) => void;

  senderFilter: string;
  setSenderFilter: (value: string) => void;

  dateFilter: string;
  setDateFilter: (value: string) => void;

  results: MockMessage[];
  setResults: (results: MockMessage[]) => void;

  loading: boolean;
  setLoading: (loading: boolean) => void;

  reset: () => void;
}

export const useSearchModalStore = create<SearchModalState>((set) => ({
  open: false,
  setOpen(open) {
    logStoreAction("searchModal", "setOpen", { open });
    set({ open });
  },
  openModal() {
    logStoreAction("searchModal", "open", {});
    set({ open: true });
  },
  closeModal() {
    logStoreAction("searchModal", "close", {});
    set({ open: false });
  },

  query: "",
  setQuery(query) {
    logStoreAction("searchModal", "setQuery", { length: query.length });
    set({ query });
  },

  streamFilter: "",
  setStreamFilter(value) {
    logStoreAction("searchModal", "setStreamFilter", { length: value.length });
    set({ streamFilter: value });
  },

  senderFilter: "",
  setSenderFilter(value) {
    logStoreAction("searchModal", "setSenderFilter", { length: value.length });
    set({ senderFilter: value });
  },

  dateFilter: "",
  setDateFilter(value) {
    logStoreAction("searchModal", "setDateFilter", { value });
    set({ dateFilter: value });
  },

  results: [],
  setResults(results) {
    logStoreAction("searchModal", "setResults", { count: results.length });
    set({ results });
  },

  loading: false,
  setLoading(loading) {
    logStoreAction("searchModal", "setLoading", { loading });
    set({ loading });
  },

  reset() {
    logStoreAction("searchModal", "reset", {});
    set({
      query: "",
      results: [],
      streamFilter: "",
      senderFilter: "",
      dateFilter: "",
      loading: false,
    });
  },
}));

