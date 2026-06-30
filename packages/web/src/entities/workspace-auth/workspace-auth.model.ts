import { create } from "zustand";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { logStoreAction } from "~/shared/lib/logger";

const WORKSPACE_AUTH_STORAGE_KEY = "workspace-auth-sessions";
const WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY = "workspace-auth-current-account";

export interface WorkspaceAuthProfile {
  uuid: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status?: "active" | "idle" | "offline" | "do_not_disturb";
}

export interface WorkspaceAuthSession extends WorkspaceRuntimeContext {
  organizationOrigin: string;
  login: string;
  profile: WorkspaceAuthProfile;
  expiresAtMs?: number;
}

interface StoredWorkspaceAuthState {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
}

// The auth store keeps all accounts, but exposes only one active runtime.
export interface WorkspaceAuthState {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
  runtimeGeneration: number;
  setSession: (session: Omit<WorkspaceAuthSession, "runtimeGeneration">) => void;
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

function normalizeStoredSessions(value: unknown): WorkspaceAuthSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: WorkspaceAuthSession[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const accountId = stringField(item, "accountId");
    const instanceId = stringField(item, "instanceId");
    const organizationId = stringField(item, "organizationId");
    const organizationOrigin = stringField(item, "organizationOrigin");
    const projectId = stringField(item, "projectId");
    const userUuid = stringField(item, "userUuid");
    const login = stringField(item, "login");
    const accessToken = stringField(item, "accessToken");
    const profile = normalizeProfile(item.profile);
    if (
      accountId == null ||
      instanceId == null ||
      organizationId == null ||
      organizationOrigin == null ||
      projectId == null ||
      userUuid == null ||
      login == null ||
      accessToken == null ||
      profile == null
    ) {
      continue;
    }
    sessions.push({
      accountId,
      instanceId,
      organizationId,
      organizationOrigin,
      projectId,
      userUuid,
      login,
      accessToken,
      profile,
      refreshToken: stringField(item, "refreshToken"),
      expiresAtMs: numberField(item, "expiresAtMs"),
      runtimeGeneration: numberField(item, "runtimeGeneration") ?? 0,
    });
  }
  return sessions;
}

function loadFromStorage(): StoredWorkspaceAuthState {
  if (typeof window === "undefined") {
    return { sessions: [], currentAccountId: null };
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_AUTH_STORAGE_KEY);
    const sessions = normalizeStoredSessions(raw ? (JSON.parse(raw) as unknown) : []);
    const currentRaw = window.localStorage.getItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    const currentAccountId =
      currentRaw != null && sessions.some((session) => session.accountId === currentRaw)
        ? currentRaw
        : (sessions[0]?.accountId ?? null);
    return { sessions, currentAccountId };
  } catch {
    return { sessions: [], currentAccountId: null };
  }
}

function persist(sessions: WorkspaceAuthSession[], currentAccountId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_AUTH_STORAGE_KEY, JSON.stringify(sessions));
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

// Generation changes make old async messenger requests harmless.
function withGeneration(
  session: Omit<WorkspaceAuthSession, "runtimeGeneration">,
  runtimeGeneration: number,
): WorkspaceAuthSession {
  return { ...session, runtimeGeneration };
}

export const useWorkspaceAuthStore = create<WorkspaceAuthState>((set, get) => ({
  ...loadFromStorage(),
  runtimeGeneration: 0,

  setSession: (session) => {
    set((state) => {
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      const existing = state.sessions.find((item) => item.accountId === session.accountId);
      const nextSession = withGeneration(session, runtimeGeneration);
      const sessions = state.sessions.some((item) => item.accountId === session.accountId)
        ? state.sessions.map((item) =>
            item.accountId === session.accountId
              ? {
                  ...nextSession,
                  instanceId: existing?.instanceId ?? nextSession.instanceId,
                }
              : item,
          )
        : [...state.sessions, nextSession];
      const currentAccountId = session.accountId;

      logStoreAction("workspaceAuth", "setSession", {
        accountId: session.accountId,
        organizationId: session.organizationId,
        projectId: session.projectId,
        userUuid: session.userUuid,
      });

      persist(sessions, currentAccountId);
      return {
        sessions,
        currentAccountId,
        runtimeGeneration,
      };
    });
  },

  setCurrentAccountId: (accountId) => {
    set((state) => {
      if (state.currentAccountId === accountId) return state;
      if (accountId != null && !state.sessions.some((session) => session.accountId === accountId)) {
        return state;
      }

      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      const sessions = state.sessions.map((session) =>
        session.accountId === accountId ? { ...session, runtimeGeneration } : session,
      );

      logStoreAction("workspaceAuth", "setCurrentAccountId", { accountId });

      persist(sessions, accountId);
      return { currentAccountId: accountId, runtimeGeneration, sessions };
    });
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
              runtimeGeneration:
                state.currentAccountId === accountId
                  ? runtimeGeneration
                  : session.runtimeGeneration,
            }
          : session,
      );

      logStoreAction("workspaceAuth", "updateTokens", { accountId });

      persist(sessions, state.currentAccountId);
      return { sessions, runtimeGeneration };
    });
  },

  removeSession: (accountId) => {
    set((state) => {
      if (!state.sessions.some((session) => session.accountId === accountId)) return state;

      const sessions = state.sessions.filter((session) => session.accountId !== accountId);
      const currentAccountId =
        state.currentAccountId === accountId
          ? (sessions[0]?.accountId ?? null)
          : state.currentAccountId;
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      const nextSessions = sessions.map((session) =>
        session.accountId === currentAccountId ? { ...session, runtimeGeneration } : session,
      );

      logStoreAction("workspaceAuth", "removeSession", { accountId });

      persist(nextSessions, currentAccountId);
      return { sessions: nextSessions, currentAccountId, runtimeGeneration };
    });
  },

  clear: () => {
    set((state) => {
      if (state.sessions.length === 0 && state.currentAccountId == null) return state;
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      logStoreAction("workspaceAuth", "clear", {});
      persist([], null);
      return { sessions: [], currentAccountId: null, runtimeGeneration };
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
