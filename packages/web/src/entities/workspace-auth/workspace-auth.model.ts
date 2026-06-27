import { create } from "zustand";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { logStoreAction } from "~/shared/lib/logger";

export interface WorkspaceAuthSession extends WorkspaceRuntimeContext {
  expiresAtMs?: number;
}

// The auth store keeps all accounts, but exposes only one active runtime.
interface WorkspaceAuthState {
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
  sessions: [],
  currentAccountId: null,
  runtimeGeneration: 0,

  setSession: (session) => {
    set((state) => {
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      const nextSession = withGeneration(session, runtimeGeneration);
      const sessions = state.sessions.some((item) => item.accountId === session.accountId)
        ? state.sessions.map((item) => (item.accountId === session.accountId ? nextSession : item))
        : [...state.sessions, nextSession];

      logStoreAction("workspaceAuth", "setSession", {
        accountId: session.accountId,
        organizationId: session.organizationId,
        projectId: session.projectId,
        userUuid: session.userUuid,
      });

      return {
        sessions,
        currentAccountId: session.accountId,
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

      return { sessions: nextSessions, currentAccountId, runtimeGeneration };
    });
  },

  clear: () => {
    set((state) => {
      if (state.sessions.length === 0 && state.currentAccountId == null) return state;
      const runtimeGeneration = nextGeneration(state.runtimeGeneration);
      logStoreAction("workspaceAuth", "clear", {});
      return { sessions: [], currentAccountId: null, runtimeGeneration };
    });
  },

  getCurrentSession: () => {
    const { currentAccountId, sessions } = get();
    return sessions.find((session) => session.accountId === currentAccountId) ?? null;
  },

  getCurrentRuntimeContext: () => {
    const session = get().getCurrentSession();
    if (session == null) return null;
    return {
      accountId: session.accountId,
      instanceId: session.instanceId,
      organizationId: session.organizationId,
      projectId: session.projectId,
      userUuid: session.userUuid,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      runtimeGeneration: session.runtimeGeneration,
    };
  },
}));
