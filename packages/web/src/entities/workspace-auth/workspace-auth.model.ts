import { create } from "zustand";
import { isWorkspaceRuntimeRequestContextCurrent } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceRuntimeContext,
  WorkspaceRuntimeOwner,
} from "~/entities/workspace-runtime/workspace-runtime.types";
import { logStoreAction } from "~/shared/lib/logger";
import {
  WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY,
  WORKSPACE_AUTH_STORAGE_KEY,
} from "~/shared/lib/workspace-auth-storage.lib";

export interface WorkspaceAuthProfile {
  uuid: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status?: "active" | "idle" | "offline" | "do_not_disturb";
}

export interface WorkspaceReauthRequiredAccount extends WorkspaceRuntimeOwner {
  organizationOrigin: string;
  projectName?: string;
  login: string;
  profile: WorkspaceAuthProfile;
}

export interface WorkspaceAuthSession
  extends WorkspaceReauthRequiredAccount, WorkspaceRuntimeContext {
  expiresAtMs?: number;
  // Account selection changes the runtime without replacing its credentials.
  credentialsRevision?: symbol;
}

interface StoredWorkspaceAuthState {
  sessions: WorkspaceAuthSession[];
  reauthRequiredAccounts: WorkspaceReauthRequiredAccount[];
  currentAccountId: string | null;
}

export interface WorkspaceAuthState extends StoredWorkspaceAuthState {
  runtimeGeneration: number;
  // Unlike runtimeGeneration, this does not change during token refresh.
  sessionSelectionGeneration: number;
  setSession: (session: Omit<WorkspaceAuthSession, "runtimeGeneration">) => void;
  requireReauthorization: (accountId: string) => void;
  restoreReauthorizedSession: (
    account: WorkspaceReauthRequiredAccount,
    session: Omit<WorkspaceAuthSession, "runtimeGeneration">,
  ) => boolean;
  updateProfileForRuntime: (
    runtime: WorkspaceRuntimeContext,
    profile: WorkspaceAuthProfile,
  ) => boolean;
  setCurrentAccountId: (accountId: string | null) => void;
  updateTokens: (
    accountId: string,
    tokens: Pick<WorkspaceAuthSession, "accessToken"> &
      Partial<Pick<WorkspaceAuthSession, "refreshToken" | "expiresAtMs">>,
  ) => void;
  removeSession: (accountId: string) => void;
  clear: () => void;
  getCurrentSession: () => WorkspaceAuthSession | null;
  getCurrentRuntimeContext: () => WorkspaceRuntimeContext | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeProfile(value: unknown): WorkspaceAuthProfile | null {
  if (!isRecord(value)) return null;
  const uuid = stringField(value, "uuid");
  const username = stringField(value, "username");
  if (uuid == null || username == null) return null;
  const status = stringField(value, "status");
  return {
    uuid,
    username,
    firstName: optionalStringField(value, "firstName"),
    lastName: optionalStringField(value, "lastName"),
    email: optionalStringField(value, "email"),
    ...(status === "active" ||
    status === "idle" ||
    status === "offline" ||
    status === "do_not_disturb"
      ? { status }
      : {}),
  };
}

function normalizeStoredAccount(
  item: Record<string, unknown>,
): WorkspaceReauthRequiredAccount | null {
  const accountId = stringField(item, "accountId");
  const instanceId = stringField(item, "instanceId");
  const organizationId = stringField(item, "organizationId");
  const organizationOrigin = stringField(item, "organizationOrigin");
  const projectId = stringField(item, "projectId");
  const projectName = stringField(item, "projectName");
  const userUuid = stringField(item, "userUuid");
  const login = stringField(item, "login");
  const profile = normalizeProfile(item.profile);
  if (
    !accountId ||
    !instanceId ||
    !organizationId ||
    !organizationOrigin ||
    !projectId ||
    !userUuid ||
    !login ||
    profile == null
  ) {
    return null;
  }
  return {
    accountId,
    instanceId,
    organizationId,
    organizationOrigin,
    projectId,
    projectName,
    userUuid,
    login,
    profile,
  };
}

function normalizeStoredAccounts(
  value: unknown,
): Pick<StoredWorkspaceAuthState, "sessions" | "reauthRequiredAccounts"> {
  const sessions: WorkspaceAuthSession[] = [];
  const reauthRequiredAccounts: WorkspaceReauthRequiredAccount[] = [];
  const accountedIds = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const account = normalizeStoredAccount(item);
      if (account == null || accountedIds.has(account.accountId)) continue;
      if (item.reauthRequired === true) {
        reauthRequiredAccounts.push(account);
        accountedIds.add(account.accountId);
        continue;
      }
      const accessToken = stringField(item, "accessToken");
      if (accessToken == null) continue;
      sessions.push({
        ...account,
        accessToken,
        refreshToken: stringField(item, "refreshToken"),
        expiresAtMs: numberField(item, "expiresAtMs"),
        runtimeGeneration: numberField(item, "runtimeGeneration") ?? 0,
      });
      accountedIds.add(account.accountId);
    }
  }
  return { sessions, reauthRequiredAccounts };
}

function hasSavedAccount(
  state: Pick<StoredWorkspaceAuthState, "sessions" | "reauthRequiredAccounts">,
  accountId: string,
): boolean {
  return (
    state.sessions.some((session) => session.accountId === accountId) ||
    state.reauthRequiredAccounts.some((account) => account.accountId === accountId)
  );
}

function loadFromStorage(): StoredWorkspaceAuthState {
  const empty = { sessions: [], reauthRequiredAccounts: [], currentAccountId: null };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_AUTH_STORAGE_KEY);
    const accounts = normalizeStoredAccounts(raw ? (JSON.parse(raw) as unknown) : []);
    const currentRaw = window.localStorage.getItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    const currentAccountId =
      currentRaw != null && hasSavedAccount(accounts, currentRaw)
        ? currentRaw
        : (accounts.sessions[0]?.accountId ??
          accounts.reauthRequiredAccounts[0]?.accountId ??
          null);
    return { ...accounts, currentAccountId };
  } catch {
    return empty;
  }
}

function persist({
  sessions,
  reauthRequiredAccounts,
  currentAccountId,
}: StoredWorkspaceAuthState): void {
  if (typeof window === "undefined") return;
  try {
    const storedAccounts = [
      ...sessions,
      ...reauthRequiredAccounts.map((account) => ({ ...account, reauthRequired: true })),
    ];
    window.localStorage.setItem(WORKSPACE_AUTH_STORAGE_KEY, JSON.stringify(storedAccounts));
    if (currentAccountId != null) {
      window.localStorage.setItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY, currentAccountId);
    } else {
      window.localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    }
  } catch {
    /* storage may be restricted */
  }
}

function nextGeneration(current: number): number {
  return current + 1;
}

// A restored background runtime advances independently of the selected account.
const retiredRuntimeGenerations = new WeakMap<WorkspaceReauthRequiredAccount, number>();

export const useWorkspaceAuthStore = create<WorkspaceAuthState>((set, get) => ({
  ...loadFromStorage(),
  runtimeGeneration: 0,
  sessionSelectionGeneration: 0,

  setSession: (session) => {
    set((state) => {
      const existing = state.sessions.find((item) => item.accountId === session.accountId);
      const reauthRequired = state.reauthRequiredAccounts.find(
        (account) => account.accountId === session.accountId,
      );
      const previousGeneration =
        reauthRequired == null
          ? existing?.runtimeGeneration
          : retiredRuntimeGenerations.get(reauthRequired);
      const runtimeGeneration = nextGeneration(
        Math.max(state.runtimeGeneration, previousGeneration ?? 0),
      );
      const nextSession: WorkspaceAuthSession = {
        ...session,
        instanceId: existing?.instanceId ?? reauthRequired?.instanceId ?? session.instanceId,
        projectName: session.projectName ?? existing?.projectName ?? reauthRequired?.projectName,
        runtimeGeneration,
        credentialsRevision: Symbol(),
      };
      const sessions =
        existing == null
          ? [...state.sessions, nextSession]
          : state.sessions.map((item) =>
              item.accountId === session.accountId ? nextSession : item,
            );
      const reauthRequiredAccounts =
        reauthRequired == null
          ? state.reauthRequiredAccounts
          : state.reauthRequiredAccounts.filter((item) => item !== reauthRequired);
      const currentAccountId = session.accountId;

      logStoreAction("workspaceAuth", "setSession", {
        accountId: session.accountId,
        organizationId: session.organizationId,
        projectId: session.projectId,
        userUuid: session.userUuid,
      });

      persist({ sessions, reauthRequiredAccounts, currentAccountId });
      return {
        sessions,
        reauthRequiredAccounts,
        currentAccountId,
        runtimeGeneration,
        sessionSelectionGeneration: nextGeneration(state.sessionSelectionGeneration),
      };
    });
  },

  requireReauthorization: (accountId) => {
    set((state) => {
      const session = state.sessions.find((item) => item.accountId === accountId);
      if (session == null) return state;

      const account: WorkspaceReauthRequiredAccount = {
        accountId,
        instanceId: session.instanceId,
        organizationId: session.organizationId,
        organizationOrigin: session.organizationOrigin,
        projectId: session.projectId,
        projectName: session.projectName,
        userUuid: session.userUuid,
        login: session.login,
        profile: session.profile,
      };
      retiredRuntimeGenerations.set(account, session.runtimeGeneration);
      const sessions = state.sessions.filter((item) => item.accountId !== accountId);
      const reauthRequiredAccounts = [...state.reauthRequiredAccounts, account];
      const isSelected = state.currentAccountId === accountId;

      persist({ ...state, sessions, reauthRequiredAccounts });
      return {
        sessions,
        reauthRequiredAccounts,
        runtimeGeneration: isSelected
          ? nextGeneration(state.runtimeGeneration)
          : state.runtimeGeneration,
        sessionSelectionGeneration: isSelected
          ? nextGeneration(state.sessionSelectionGeneration)
          : state.sessionSelectionGeneration,
      };
    });
  },

  restoreReauthorizedSession: (account, session) => {
    let restored = false;
    set((state) => {
      if (!state.reauthRequiredAccounts.includes(account)) return state;

      const runtimeGeneration = nextGeneration(
        Math.max(state.runtimeGeneration, retiredRuntimeGenerations.get(account) ?? 0),
      );
      const sessions = [
        ...state.sessions,
        { ...session, runtimeGeneration, credentialsRevision: Symbol() },
      ];
      const reauthRequiredAccounts = state.reauthRequiredAccounts.filter(
        (item) => item !== account,
      );
      const isSelected = state.currentAccountId === account.accountId;
      persist({ ...state, sessions, reauthRequiredAccounts });
      restored = true;
      return {
        sessions,
        reauthRequiredAccounts,
        runtimeGeneration: isSelected ? runtimeGeneration : state.runtimeGeneration,
        sessionSelectionGeneration: isSelected
          ? nextGeneration(state.sessionSelectionGeneration)
          : state.sessionSelectionGeneration,
      };
    });
    return restored;
  },

  setCurrentAccountId: (accountId) => {
    set((state) => {
      if (state.currentAccountId === accountId) return state;
      if (accountId != null && !hasSavedAccount(state, accountId)) {
        return state;
      }

      const selectedSession = state.sessions.find((session) => session.accountId === accountId);
      const runtimeGeneration = nextGeneration(
        Math.max(state.runtimeGeneration, selectedSession?.runtimeGeneration ?? 0),
      );
      const sessions = state.sessions.map((session) =>
        session === selectedSession ? { ...session, runtimeGeneration } : session,
      );

      logStoreAction("workspaceAuth", "setCurrentAccountId", { accountId });

      persist({ ...state, sessions, currentAccountId: accountId });
      return {
        currentAccountId: accountId,
        runtimeGeneration,
        sessions,
        sessionSelectionGeneration: nextGeneration(state.sessionSelectionGeneration),
      };
    });
  },

  updateProfileForRuntime: (runtime, profile) => {
    let applied = false;
    set((state) => {
      if (
        profile.uuid !== runtime.userUuid ||
        !isWorkspaceRuntimeRequestContextCurrent(runtime, () =>
          selectCurrentWorkspaceRuntimeContext(state),
        )
      ) {
        return state;
      }
      const sessions = state.sessions.map((session) =>
        session.accountId === runtime.accountId
          ? {
              ...session,
              profile,
              login: session.login === session.profile.username ? profile.username : session.login,
            }
          : session,
      );
      persist({ ...state, sessions });
      applied = true;
      // Identity edits do not replace tokens or restart the messenger runtime.
      return { sessions };
    });
    return applied;
  },

  updateTokens: (accountId, tokens) => {
    set((state) => {
      if (!state.sessions.some((session) => session.accountId === accountId)) return state;

      const runtimeGeneration =
        state.currentAccountId === accountId
          ? nextGeneration(state.runtimeGeneration)
          : state.runtimeGeneration;
      const sessions = state.sessions.map((session) =>
        session.accountId === accountId
          ? {
              ...session,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken ?? session.refreshToken,
              expiresAtMs: tokens.expiresAtMs ?? session.expiresAtMs,
              credentialsRevision: Symbol(),
              runtimeGeneration:
                state.currentAccountId === accountId
                  ? runtimeGeneration
                  : session.runtimeGeneration,
            }
          : session,
      );

      logStoreAction("workspaceAuth", "updateTokens", { accountId });

      persist({ ...state, sessions });
      return { sessions, runtimeGeneration };
    });
  },

  removeSession: (accountId) => {
    set((state) => {
      if (!hasSavedAccount(state, accountId)) return state;

      const authorized = state.sessions.filter((session) => session.accountId !== accountId);
      const reauthRequiredAccounts = state.reauthRequiredAccounts.filter(
        (account) => account.accountId !== accountId,
      );
      const removedSelected = state.currentAccountId === accountId;
      const currentAccountId = removedSelected
        ? (authorized[0]?.accountId ?? reauthRequiredAccounts[0]?.accountId ?? null)
        : state.currentAccountId;
      const nextSession = authorized.find((session) => session.accountId === currentAccountId);
      const runtimeGeneration = removedSelected
        ? nextGeneration(Math.max(state.runtimeGeneration, nextSession?.runtimeGeneration ?? 0))
        : state.runtimeGeneration;
      const sessions = removedSelected
        ? authorized.map((session) =>
            session.accountId === currentAccountId ? { ...session, runtimeGeneration } : session,
          )
        : authorized;

      logStoreAction("workspaceAuth", "removeSession", { accountId });

      persist({ sessions, reauthRequiredAccounts, currentAccountId });
      return {
        sessions,
        reauthRequiredAccounts,
        currentAccountId,
        runtimeGeneration,
        sessionSelectionGeneration: removedSelected
          ? nextGeneration(state.sessionSelectionGeneration)
          : state.sessionSelectionGeneration,
      };
    });
  },

  clear: () => {
    set((state) => {
      if (
        state.sessions.length === 0 &&
        state.reauthRequiredAccounts.length === 0 &&
        state.currentAccountId == null
      )
        return state;
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      logStoreAction("workspaceAuth", "clear", {});
      const empty = { sessions: [], reauthRequiredAccounts: [], currentAccountId: null };
      persist(empty);
      return {
        ...empty,
        runtimeGeneration,
        sessionSelectionGeneration: nextGeneration(state.sessionSelectionGeneration),
      };
    });
  },

  getCurrentSession: () => {
    const { currentAccountId, sessions } = get();
    return sessions.find((session) => session.accountId === currentAccountId) ?? null;
  },

  getCurrentRuntimeContext: () => {
    return selectCurrentWorkspaceRuntimeContext(get());
  },
}));

export function selectCurrentWorkspaceRuntimeContext(
  state: Pick<WorkspaceAuthState, "sessions" | "currentAccountId">,
): WorkspaceRuntimeContext | null {
  const session = state.sessions.find((item) => item.accountId === state.currentAccountId) ?? null;
  if (session == null) return null;
  return {
    accountId: session.accountId,
    instanceId: session.instanceId,
    organizationId: session.organizationId,
    organizationOrigin: session.organizationOrigin,
    projectId: session.projectId,
    userUuid: session.userUuid,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    runtimeGeneration: session.runtimeGeneration,
  };
}
