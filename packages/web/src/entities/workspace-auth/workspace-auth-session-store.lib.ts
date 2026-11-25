import { useStore, type StoreApi, type UseBoundStore } from "zustand";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import {
  useWorkspaceAuthStore,
  workspaceAuthSessionIncarnation,
  type WorkspaceAuthSession,
  type WorkspaceAuthState,
} from "./workspace-auth.model";

// Each authorized incarnation owns its store. React only selects which one to read.
export function createWorkspaceSessionStore<State extends { ownerKey: string | null }>(
  createStore: (ownerKey: string | null) => StoreApi<State>,
) {
  const stores = new Map<string, { incarnation: number; store: StoreApi<State> }>();
  const unselected = createStore(null);
  const selectSession = ({ sessions, currentAccountId }: WorkspaceAuthState) =>
    sessions.find((session) => session.accountId === currentAccountId);

  function forSession(session: WorkspaceAuthSession): StoreApi<State> {
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const incarnation = workspaceAuthSessionIncarnation(session);
    const existing = stores.get(ownerKey);
    if (existing?.incarnation === incarnation) return existing.store;
    const store = createStore(ownerKey);
    stores.set(ownerKey, { incarnation, store });
    return store;
  }

  function getForOwner(ownerKey: string): StoreApi<State> | null {
    const { sessions } = useWorkspaceAuthStore.getState();
    const session = sessions.find((candidate) => workspaceRuntimeOwnerKey(candidate) === ownerKey);
    if (session != null) return forSession(session);
    return sessions.length === 0 && unselected.getState().ownerKey === ownerKey ? unselected : null;
  }

  // Release departed incarnations on auth publication, before the next screen renders.
  function prune(sessions: readonly WorkspaceAuthSession[]): void {
    const authorized = new Map(
      sessions.map(
        (session) =>
          [workspaceRuntimeOwnerKey(session), workspaceAuthSessionIncarnation(session)] as const,
      ),
    );
    for (const [ownerKey, entry] of stores.entries()) {
      if (authorized.get(ownerKey) !== entry.incarnation) stores.delete(ownerKey);
    }
  }
  const unsubscribeAuth = useWorkspaceAuthStore.subscribe((state, previous) => {
    if (state.sessions !== previous.sessions) prune(state.sessions);
  });
  import.meta.hot?.dispose(unsubscribeAuth);

  // Bootstrap creates all authorized models, including those with no selected view.
  function reconcile(sessions: readonly WorkspaceAuthSession[]): void {
    prune(sessions);
    for (const session of sessions) forSession(session);
  }

  const getSelected = () => {
    const session = selectSession(useWorkspaceAuthStore.getState());
    return session == null ? unselected : forSession(session);
  };
  const subscribe: StoreApi<State>["subscribe"] = (listener) => {
    let selected = getSelected();
    let unsubscribe = selected.subscribe(listener);
    const unsubscribeSelection = useWorkspaceAuthStore.subscribe(() => {
      const current = getSelected();
      if (current === selected) return;
      const previousState = selected.getState();
      unsubscribe();
      selected = current;
      unsubscribe = current.subscribe(listener);
      listener(current.getState(), previousState);
    });
    return () => {
      unsubscribe();
      unsubscribeSelection();
    };
  };
  const setState: StoreApi<State>["setState"] = (update, replace) => {
    const selected = getSelected();
    if (replace === true) {
      selected.setState(update as State | ((state: State) => State), true);
    } else {
      selected.setState(update, replace);
    }
  };

  // Keep the callable Zustand entry for existing UI readers during the migration.
  const useSelected: UseBoundStore<StoreApi<State>> = Object.assign(
    <Selection>(selector?: (state: State) => Selection) => {
      const session = useWorkspaceAuthStore(selectSession);
      const store = session == null ? unselected : forSession(session);
      return useStore(store, selector ?? ((state) => state as unknown as Selection));
    },
    {
      getState: () => getSelected().getState(),
      getInitialState: () => getSelected().getInitialState(),
      setState,
      subscribe,
    },
  );
  return { useSelected, getSelected, getForOwner, reconcile };
}
