import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

interface SearchModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
  openModal: () => void;
  closeModal: () => void;

  query: string;
  setQuery: (query: string) => void;

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

  reset() {
    logStoreAction("searchModal", "reset", {});
    set({
      query: "",
    });
  },
}));
