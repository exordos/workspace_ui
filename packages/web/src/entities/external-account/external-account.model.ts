import { create } from "zustand";
import type { ExternalAccount, ExternalAccountLoadStatus } from "./external-account.types";

export type { ExternalAccountLoadStatus } from "./external-account.types";

export interface ExternalAccountsStoreState {
  ownerKey: string | null;
  accounts: ExternalAccount[];
  loadStatus: ExternalAccountLoadStatus;
  error: string | null;
  lastLoadedAt: number | null;
  startOwnerSync: (ownerKey: string) => void;
  replaceAccountsForOwner: (
    ownerKey: string,
    accounts: ExternalAccount[],
    loadedAt?: number,
  ) => boolean;
  setLoadStatusForOwner: (
    ownerKey: string,
    status: ExternalAccountLoadStatus,
    error?: string | null,
  ) => boolean;
  setErrorForOwner: (ownerKey: string, error: string) => boolean;
  clear: () => void;
}

const EMPTY_ACCOUNTS: ExternalAccount[] = [];

export const useExternalAccountsStore = create<ExternalAccountsStoreState>((set) => ({
  ownerKey: null,
  accounts: EMPTY_ACCOUNTS,
  loadStatus: "idle",
  error: null,
  lastLoadedAt: null,

  startOwnerSync(ownerKey) {
    set((state) => {
      if (state.ownerKey === ownerKey) {
        return { loadStatus: "loading", error: null };
      }
      return {
        ownerKey,
        accounts: EMPTY_ACCOUNTS,
        loadStatus: "loading",
        error: null,
        lastLoadedAt: null,
      };
    });
  },

  replaceAccountsForOwner(ownerKey, accounts, loadedAt = Date.now()) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      applied = true;
      return {
        accounts,
        loadStatus: "ready" as const,
        error: null,
        lastLoadedAt: loadedAt,
      };
    });
    return applied;
  },

  setLoadStatusForOwner(ownerKey, status, error = null) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      applied = true;
      return { loadStatus: status, error };
    });
    return applied;
  },

  setErrorForOwner(ownerKey, error) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      applied = true;
      return { loadStatus: "error" as const, error };
    });
    return applied;
  },

  clear() {
    set({
      ownerKey: null,
      accounts: EMPTY_ACCOUNTS,
      loadStatus: "idle",
      error: null,
      lastLoadedAt: null,
    });
  },
}));

export const useExternalAccountStore = useExternalAccountsStore;
export type ExternalAccountStoreState = ExternalAccountsStoreState;
