import { create } from "zustand";
import type { ExternalAccount, ExternalAccountLoadStatus } from "./external-account.types";

export type { ExternalAccountLoadStatus } from "./external-account.types";

export interface ExternalAccountsStoreState {
  ownerKey: string | null;
  accounts: ExternalAccount[];
  loadStatus: ExternalAccountLoadStatus;
  error: string | null;
  lastLoadedAt: number | null;
  loadGeneration: number;
  startOwnerSync: (ownerKey: string) => number;
  replaceAccountsForOwner: (
    ownerKey: string,
    accounts: ExternalAccount[],
    loadedAt?: number,
    loadGeneration?: number,
  ) => boolean;
  upsertAccountForOwner: (ownerKey: string, account: ExternalAccount) => boolean;
  removeAccountForOwner: (ownerKey: string, accountUuid: string) => boolean;
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
  loadGeneration: 0,

  startOwnerSync(ownerKey) {
    let generation = 0;
    set((state) => {
      generation = state.loadGeneration + 1;
      if (state.ownerKey === ownerKey) {
        return { loadGeneration: generation, loadStatus: "loading", error: null };
      }
      return {
        ownerKey,
        accounts: EMPTY_ACCOUNTS,
        loadGeneration: generation,
        loadStatus: "loading",
        error: null,
        lastLoadedAt: null,
      };
    });
    return generation;
  },

  replaceAccountsForOwner(ownerKey, accounts, loadedAt = Date.now(), loadGeneration) {
    let applied = false;
    set((state) => {
      if (
        state.ownerKey !== ownerKey ||
        (loadGeneration != null && state.loadGeneration !== loadGeneration)
      ) {
        return state;
      }
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

  upsertAccountForOwner(ownerKey, account) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      const current = state.accounts.find((item) => item.uuid === account.uuid);
      if (current != null && current.revision > account.revision) return state;
      applied = true;
      return {
        accounts:
          current == null
            ? [...state.accounts, account]
            : state.accounts.map((item) => (item.uuid === account.uuid ? account : item)),
        loadGeneration: state.loadGeneration + 1,
      };
    });
    return applied;
  },

  removeAccountForOwner(ownerKey, accountUuid) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      applied = true;
      return {
        accounts: state.accounts.filter((account) => account.uuid !== accountUuid),
        loadGeneration: state.loadGeneration + 1,
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
      loadGeneration: 0,
    });
  },
}));

export const useExternalAccountStore = useExternalAccountsStore;
export type ExternalAccountStoreState = ExternalAccountsStoreState;
