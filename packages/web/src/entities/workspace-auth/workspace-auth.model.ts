import { create } from "zustand";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
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

export interface WorkspaceAuthSession extends WorkspaceRuntimeContext {
  organizationOrigin: string;
  login: string;
  profile: WorkspaceAuthProfile;
  expiresAtMs?: number;
  incarnationGeneration?: number; // A login replaces the live owner even when it keeps the durable key.
  screenGeneration?: number; // The most recent selection or active token refresh for this owner.
}

type NewWorkspaceAuthSession = Omit<
  WorkspaceAuthSession,
  "runtimeGeneration" | "screenGeneration" | "incarnationGeneration" | "ownerRuntimeGeneration"
>;

interface StoredWorkspaceAuthState {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
}

// The auth store exposes every credential context and a separate selected-screen context.
export interface WorkspaceAuthState {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
  runtimeGeneration: number; // Selected-screen generation for UI subscribers.
  runtimeGenerationSequence: number; // Sequence shared by credential and selection changes.
  // Unlike runtimeGeneration, this does not change during token refresh.
  sessionSelectionGeneration: number;
  runtimeSuspended: boolean; // Revokes this document's owner contexts until a cold reload.
  setSession: (session: NewWorkspaceAuthSession) => void;
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
  getRuntimeContextForOwner: (owner: WorkspaceRuntimeOwner) => WorkspaceAuthSession | null;
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
    const runtimeGeneration = numberField(item, "runtimeGeneration") ?? 0;
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
      runtimeGeneration,
      incarnationGeneration: numberField(item, "incarnationGeneration") ?? runtimeGeneration,
      screenGeneration: numberField(item, "screenGeneration") ?? runtimeGeneration,
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

function latestSessionGeneration(sessions: readonly WorkspaceAuthSession[]): number {
  return sessions.reduce(
    (latest, session) => Math.max(latest, session.runtimeGeneration, session.screenGeneration ?? 0),
    0,
  );
}

function nextRuntimeGeneration(state: WorkspaceAuthState): number {
  return (
    Math.max(
      state.runtimeGeneration,
      state.runtimeGenerationSequence,
      latestSessionGeneration(state.sessions),
    ) + 1
  );
}

// Credential refresh keeps the incarnation introduced by login stable.
export function workspaceAuthSessionIncarnation(session: WorkspaceAuthSession): number {
  return session.incarnationGeneration ?? session.runtimeGeneration;
}

const selectedRuntimeContexts = new WeakMap<WorkspaceAuthSession, WorkspaceRuntimeContext>();
const initialState = loadFromStorage();

export const useWorkspaceAuthStore = create<WorkspaceAuthState>((set, get) => ({
  ...initialState,
  runtimeGeneration: selectCurrentWorkspaceRuntimeContext(initialState)?.runtimeGeneration ?? 0,
  runtimeGenerationSequence: latestSessionGeneration(initialState.sessions),
  sessionSelectionGeneration: 0,
  runtimeSuspended: false,

  setSession: (session) => {
    set((state) => {
      const runtimeGeneration = nextRuntimeGeneration(state);
      const existing = state.sessions.find((item) => item.accountId === session.accountId);
      const nextSession: WorkspaceAuthSession = {
        ...session,
        instanceId: existing?.instanceId ?? session.instanceId,
        runtimeGeneration,
        incarnationGeneration: runtimeGeneration,
        screenGeneration: runtimeGeneration,
      };
      const sessions =
        existing != null
          ? state.sessions.map((item) =>
              item.accountId === session.accountId ? nextSession : item,
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
        runtimeGenerationSequence: runtimeGeneration,
        sessionSelectionGeneration: state.sessionSelectionGeneration + 1,
      };
    });
  },

  setCurrentAccountId: (accountId) => {
    set((state) => {
      if (state.currentAccountId === accountId) return state;
      if (accountId != null && !state.sessions.some((session) => session.accountId === accountId)) {
        return state;
      }

      const runtimeGeneration = nextRuntimeGeneration(state);
      const sessions = state.sessions.map((session) =>
        session.accountId === accountId
          ? { ...session, screenGeneration: runtimeGeneration }
          : session,
      );

      logStoreAction("workspaceAuth", "setCurrentAccountId", { accountId });

      persist(sessions, accountId);
      return {
        currentAccountId: accountId,
        runtimeGeneration,
        runtimeGenerationSequence: runtimeGeneration,
        sessions,
        sessionSelectionGeneration: state.sessionSelectionGeneration + 1,
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
      persist(sessions, state.currentAccountId);
      applied = true;
      // Identity edits do not replace tokens or restart the messenger runtime.
      return { sessions };
    });
    return applied;
  },

  updateTokens: (accountId, tokens) => {
    set((state) => {
      if (!state.sessions.some((session) => session.accountId === accountId)) return state;

      const credentialGeneration = nextRuntimeGeneration(state);
      const active = state.currentAccountId === accountId;
      const sessions = state.sessions.map((session) =>
        session.accountId === accountId
          ? {
              ...session,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken ?? session.refreshToken,
              expiresAtMs: tokens.expiresAtMs ?? session.expiresAtMs,
              runtimeGeneration: credentialGeneration,
              incarnationGeneration: workspaceAuthSessionIncarnation(session),
              screenGeneration: active
                ? credentialGeneration
                : (session.screenGeneration ?? session.runtimeGeneration),
            }
          : session,
      );

      logStoreAction("workspaceAuth", "updateTokens", { accountId });

      persist(sessions, state.currentAccountId);
      return {
        sessions,
        runtimeGeneration: active ? credentialGeneration : state.runtimeGeneration,
        runtimeGenerationSequence: credentialGeneration,
      };
    });
  },

  removeSession: (accountId) => {
    set((state) => {
      if (!state.sessions.some((session) => session.accountId === accountId)) return state;

      const sessions = state.sessions.filter((session) => session.accountId !== accountId);
      const active = state.currentAccountId === accountId;
      const currentAccountId = active ? (sessions[0]?.accountId ?? null) : state.currentAccountId;
      const runtimeGeneration = active ? nextRuntimeGeneration(state) : state.runtimeGeneration;
      const nextSessions = active
        ? sessions.map((session) =>
            session.accountId === currentAccountId
              ? { ...session, screenGeneration: runtimeGeneration }
              : session,
          )
        : sessions;

      logStoreAction("workspaceAuth", "removeSession", { accountId });

      persist(nextSessions, currentAccountId);
      return {
        sessions: nextSessions,
        currentAccountId,
        runtimeGeneration,
        runtimeGenerationSequence: active ? runtimeGeneration : state.runtimeGenerationSequence,
        sessionSelectionGeneration: state.sessionSelectionGeneration + (active ? 1 : 0),
      };
    });
  },

  clear: () => {
    set((state) => {
      if (state.sessions.length === 0 && state.currentAccountId == null) return state;
      const runtimeGeneration = nextRuntimeGeneration(state);
      logStoreAction("workspaceAuth", "clear", {});
      persist([], null);
      return {
        sessions: [],
        currentAccountId: null,
        runtimeGeneration,
        runtimeGenerationSequence: runtimeGeneration,
        sessionSelectionGeneration: state.sessionSelectionGeneration + 1,
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

  getRuntimeContextForOwner: (owner) => {
    const state = get();
    if (state.runtimeSuspended) return null;
    const key = workspaceRuntimeOwnerKey(owner);
    return state.sessions.find((session) => workspaceRuntimeOwnerKey(session) === key) ?? null;
  },
}));

// Revoke all request contexts without persisting any change to the IAM sessions.
export function suspendWorkspaceRuntimeForColdStart(): void {
  useWorkspaceAuthStore.setState({ runtimeSuspended: true });
}

export function selectCurrentWorkspaceRuntimeContext(
  state: Pick<WorkspaceAuthState, "sessions" | "currentAccountId"> &
    Partial<Pick<WorkspaceAuthState, "runtimeSuspended">>,
): WorkspaceRuntimeContext | null {
  if (state.runtimeSuspended) return null;
  const session = state.sessions.find((item) => item.accountId === state.currentAccountId) ?? null;
  if (session == null) return null;
  const cached = selectedRuntimeContexts.get(session);
  if (cached != null) return cached;
  const context = {
    accountId: session.accountId,
    instanceId: session.instanceId,
    organizationId: session.organizationId,
    organizationOrigin: session.organizationOrigin,
    projectId: session.projectId,
    userUuid: session.userUuid,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    runtimeGeneration: session.screenGeneration ?? session.runtimeGeneration,
    ownerRuntimeGeneration: session.runtimeGeneration,
  };
  // Background changes keep the same selected request context and its subscriptions.
  selectedRuntimeContexts.set(session, context);
  return context;
}

// Accept either a live credential context or the current screen's request, then bind it to its owner.
export function resolveWorkspaceOwnerRuntimeForRequest(
  request: WorkspaceRuntimeContext,
): WorkspaceAuthSession | null {
  const auth = useWorkspaceAuthStore.getState();
  const owner = auth.getRuntimeContextForOwner(request);
  if (owner == null) return null;
  if (request.ownerRuntimeGeneration == null) {
    return owner.runtimeGeneration === request.runtimeGeneration ? owner : null;
  }
  return owner.runtimeGeneration === request.ownerRuntimeGeneration &&
    isWorkspaceRuntimeRequestContextCurrent(request, auth.getCurrentRuntimeContext)
    ? owner
    : null;
}
