import {
  createWorkspaceRealtimeNoopApplier,
  type WorkspaceRealtimeDiagnostic,
  type WorkspaceRealtimeEventApplier,
  type WorkspaceRealtimeEventContext,
  type WorkspaceRealtimeRuntimeContext,
  type WorkspaceRealtimeRuntimeOwner,
  type WorkspaceRealtimeSurface,
  type WorkspaceRealtimeTransportCore,
  type WorkspaceRealtimeTransportState,
} from "./workspace-realtime-runtime.lib";

export interface WorkspaceRealtimeManagerRuntimeContext {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  runtimeKey?: string;
}

export interface WorkspaceRealtimeManagerRuntimeFactoryOptions<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
> {
  runtimeContext: TContext;
  applier: WorkspaceRealtimeEventApplier;
  isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  onDiagnostic: (diagnostic: WorkspaceRealtimeDiagnostic) => void;
}

export type WorkspaceRealtimeManagerRuntimeFactory<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
> = (
  options: WorkspaceRealtimeManagerRuntimeFactoryOptions<TContext>,
) => WorkspaceRealtimeTransportCore;

export interface WorkspaceRealtimeManagerApplierFactoryOptions {
  isOwnerCurrent: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
}

export interface WorkspaceRealtimeManagerOptions<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
> {
  runtimeFactory: WorkspaceRealtimeManagerRuntimeFactory<TContext>;
  activeApplierFactory: (
    options: WorkspaceRealtimeManagerApplierFactoryOptions,
  ) => WorkspaceRealtimeEventApplier;
  backgroundApplierFactory?: (
    options: WorkspaceRealtimeManagerApplierFactoryOptions,
  ) => WorkspaceRealtimeEventApplier;
  selectSurface?: (context: TContext) => WorkspaceRealtimeSurface; // View selection does not restart this runtime.
  isOwnerCurrent?: (
    owner: WorkspaceRealtimeRuntimeOwner,
    surface: WorkspaceRealtimeSurface,
    context: TContext,
  ) => boolean;
  onDiagnostic?: (diagnostic: WorkspaceRealtimeDiagnostic) => void;
}

export interface WorkspaceRealtimeManagerEntrySnapshot {
  owner: WorkspaceRealtimeRuntimeOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeSurface;
  lastTransportState: WorkspaceRealtimeTransportState | null;
  diagnostics: WorkspaceRealtimeDiagnostic[];
}

export interface WorkspaceRealtimeManagerSnapshot {
  activeOwnerKey: string | null;
  entries: WorkspaceRealtimeManagerEntrySnapshot[];
}

export interface WorkspaceRealtimeRuntimeManager<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
> {
  update(contexts: TContext[], activeOwnerKey: string | null): Promise<void>;
  reconnectAll(reason?: string): Promise<void>;
  restartOwner(ownerKey: string): Promise<void>;
  stopAll(reason?: string): Promise<void>;
  getSnapshot(): WorkspaceRealtimeManagerSnapshot;
}

interface RuntimeEntry<TContext extends WorkspaceRealtimeManagerRuntimeContext> {
  // Entry живёт на ownerKey: один проект может переключаться active/background без второго socket.
  runtime: WorkspaceRealtimeTransportCore;
  managerContext: TContext;
  controller: AbortController;
  previousStop?: Promise<void>; // Replacement waits only for the previous runtime of the same owner.
  surface: WorkspaceRealtimeSurface;
  activeApplier: WorkspaceRealtimeEventApplier;
  backgroundApplier: WorkspaceRealtimeEventApplier;
  lastTransportState: WorkspaceRealtimeTransportState | null;
  diagnostics: WorkspaceRealtimeDiagnostic[];
}

function isSameOwner(
  left: WorkspaceRealtimeRuntimeOwner,
  right: WorkspaceRealtimeRuntimeOwner,
): boolean {
  // Сравниваем durable owner без runtimeGeneration: это один и тот же cursor/store scope.
  return (
    left.accountId === right.accountId &&
    left.instanceId === right.instanceId &&
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.userUuid === right.userUuid
  );
}

function isSameRuntimeOwner(
  left: WorkspaceRealtimeRuntimeOwner,
  right: WorkspaceRealtimeRuntimeOwner,
): boolean {
  // А здесь уже проверяем in-memory поколение, чтобы закрыть старый socket после refresh/re-login.
  return isSameOwner(left, right) && left.runtimeGeneration === right.runtimeGeneration;
}

function buildRuntimeContext<TContext extends WorkspaceRealtimeManagerRuntimeContext>(
  context: TContext,
  surface: WorkspaceRealtimeSurface,
  signal: AbortSignal,
): WorkspaceRealtimeRuntimeContext {
  return {
    owner: context.owner,
    ownerKey: context.ownerKey,
    surface,
    signal,
  };
}

function delegateBySurface<TContext extends WorkspaceRealtimeManagerRuntimeContext>(
  entry: RuntimeEntry<TContext>,
  context: WorkspaceRealtimeEventContext | WorkspaceRealtimeRuntimeContext,
): WorkspaceRealtimeEventApplier {
  // Один transport core не знает, активный он сейчас или фоновый.
  // Manager маршрутизирует apply в нужный applier по surface.
  return context.surface === "active" ? entry.activeApplier : entry.backgroundApplier;
}

function createRoutingApplier<TContext extends WorkspaceRealtimeManagerRuntimeContext>(
  getEntry: () => RuntimeEntry<TContext>,
  selectSurface?: (context: TContext) => WorkspaceRealtimeSurface,
): WorkspaceRealtimeEventApplier {
  function forCurrentSurface<Context extends WorkspaceRealtimeRuntimeContext>(
    entry: RuntimeEntry<TContext>,
    context: Context,
  ): Context {
    const surface = selectSurface?.(entry.managerContext) ?? context.surface;
    return surface === context.surface ? context : { ...context, surface };
  }
  return {
    applyEvent(event, context) {
      const entry = getEntry();
      const current = forCurrentSurface(entry, context);
      return delegateBySurface(entry, current).applyEvent(event, current);
    },
    skipEvent(event, reason, context) {
      const entry = getEntry();
      const current = forCurrentSurface(entry, context);
      return delegateBySurface(entry, current).skipEvent(event, reason, current);
    },
    onTransportStateChange(state, context) {
      const entry = getEntry();
      const current = forCurrentSurface(entry, context);
      const currentState =
        state.surface === current.surface ? state : { ...state, surface: current.surface };
      entry.lastTransportState = currentState;
      return delegateBySurface(entry, current).onTransportStateChange(currentState, current);
    },
  };
}

export function createWorkspaceRealtimeRuntimeManager<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
>(options: WorkspaceRealtimeManagerOptions<TContext>): WorkspaceRealtimeRuntimeManager<TContext> {
  const entries = new Map<string, RuntimeEntry<TContext>>();
  let activeOwnerKey: string | null = null;

  // Keep the predicate tied to its entry even if the same owner replaces it.
  function isEntryOwnerCurrent(
    entry: RuntimeEntry<TContext>,
    owner: WorkspaceRealtimeRuntimeOwner,
  ): boolean {
    if (entries.get(entry.managerContext.ownerKey) !== entry || entry.controller.signal.aborted) {
      return false;
    }
    if (!isSameRuntimeOwner(entry.managerContext.owner, owner)) return false;
    return options.isOwnerCurrent?.(owner, entry.surface, entry.managerContext) ?? true;
  }

  function recordDiagnostic(diagnostic: WorkspaceRealtimeDiagnostic): void {
    const entry = entries.get(diagnostic.ownerKey);
    if (entry != null) {
      entry.diagnostics.push(diagnostic);
    }
    options.onDiagnostic?.(diagnostic);
  }

  function createEntry(
    managerContext: TContext,
    surface: WorkspaceRealtimeSurface,
  ): RuntimeEntry<TContext> {
    const controller = new AbortController();
    let entry: RuntimeEntry<TContext> | null = null;
    const isOwnerCurrent = (owner: WorkspaceRealtimeRuntimeOwner) =>
      entry != null && isEntryOwnerCurrent(entry, owner);
    const activeApplier = options.activeApplierFactory({ isOwnerCurrent });
    // The host chooses background participants. A host without them can still track transport.
    const backgroundApplier =
      options.backgroundApplierFactory?.({ isOwnerCurrent }) ??
      createWorkspaceRealtimeNoopApplier();
    const routingApplier = createRoutingApplier<TContext>(() => {
      if (entry == null) {
        throw new Error("Workspace realtime manager entry is not initialized");
      }
      return entry;
    }, options.selectSurface);

    const runtime = options.runtimeFactory({
      runtimeContext: managerContext,
      applier: routingApplier,
      isOwnerCurrent,
      onDiagnostic: recordDiagnostic,
    });

    entry = {
      runtime,
      managerContext,
      controller,
      surface,
      activeApplier,
      backgroundApplier,
      lastTransportState: null,
      diagnostics: [],
    };
    return entry;
  }

  function shouldReplaceRuntime(entry: RuntimeEntry<TContext>, nextContext: TContext): boolean {
    // runtimeKey меняется, когда обновился token/origin. Такой socket проще пересоздать целиком.
    return entry.managerContext.runtimeKey !== nextContext.runtimeKey;
  }

  function shouldRestartRuntime(
    entry: RuntimeEntry<TContext>,
    nextContext: TContext,
    nextSurface: WorkspaceRealtimeSurface,
  ): boolean {
    // Surface или runtimeGeneration поменялись - перезапускаем тот же entry с новым context.
    return (
      (options.selectSurface == null && entry.surface !== nextSurface) ||
      !isSameRuntimeOwner(entry.managerContext.owner, nextContext.owner)
    );
  }

  async function startEntry(
    entry: RuntimeEntry<TContext>,
    managerContext: TContext,
    surface: WorkspaceRealtimeSurface,
  ): Promise<void> {
    entry.controller.abort();
    const controller = new AbortController();
    entry.controller = controller;
    entry.managerContext = managerContext;
    entry.surface = surface;
    if (entry.previousStop != null) {
      await entry.previousStop;
    }
    if (controller.signal.aborted) return;
    await entry.runtime.start(buildRuntimeContext(managerContext, surface, controller.signal));
  }

  async function stopEntry(entry: RuntimeEntry<TContext>, reason: string): Promise<void> {
    const previousStop = entry.previousStop;
    // Capture an active predecessor before aborting the entry's selection scope.
    const stopping =
      reason === "manager_replace"
        ? entry.runtime.stop(reason, { waitForApplications: true })
        : entry.runtime.stop(reason);
    entry.controller.abort();
    await Promise.all([previousStop, stopping]);
  }

  async function applyUpdate(
    contexts: TContext[],
    nextActiveOwnerKey: string | null,
  ): Promise<void> {
    activeOwnerKey = nextActiveOwnerKey;
    const nextOwnerKeys = new Set(contexts.map((context) => context.ownerKey));
    const transitions: Promise<void>[] = [];

    for (const [ownerKey, entry] of entries) {
      if (nextOwnerKeys.has(ownerKey)) continue;
      entries.delete(ownerKey);
      transitions.push(stopEntry(entry, "manager_remove"));
    }

    for (const managerContext of contexts) {
      const surface: WorkspaceRealtimeSurface =
        managerContext.ownerKey === nextActiveOwnerKey ? "active" : "background";
      const existing = entries.get(managerContext.ownerKey);
      if (existing == null) {
        const entry = createEntry(managerContext, surface);
        entries.set(managerContext.ownerKey, entry);
        transitions.push(startEntry(entry, managerContext, surface));
        continue;
      }

      if (shouldReplaceRuntime(existing, managerContext)) {
        const entry = createEntry(managerContext, surface);
        entries.set(managerContext.ownerKey, entry);
        entry.previousStop = stopEntry(existing, "manager_replace");
        transitions.push(startEntry(entry, managerContext, surface));
        continue;
      }

      if (shouldRestartRuntime(existing, managerContext, surface)) {
        transitions.push(startEntry(existing, managerContext, surface));
        continue;
      }

      existing.managerContext = managerContext;
      existing.surface = surface;
    }
    await Promise.all(transitions);
  }

  return {
    update(contexts, nextActiveOwnerKey) {
      // Reconcile synchronously, then wait for owner-specific work. Slow A cannot delay B or removal.
      return applyUpdate(contexts, nextActiveOwnerKey);
    },
    async reconnectAll(reason = "manager_reconnect") {
      await Promise.all([...entries.values()].map((entry) => entry.runtime.reconnect(reason)));
    },
    async restartOwner(ownerKey) {
      const entry = entries.get(ownerKey);
      if (entry == null) return;
      await startEntry(entry, entry.managerContext, entry.surface);
    },
    async stopAll(reason = "manager_stop") {
      activeOwnerKey = null;
      const currentEntries = [...entries.values()];
      entries.clear();
      await Promise.all(currentEntries.map((entry) => stopEntry(entry, reason)));
    },
    getSnapshot() {
      return {
        activeOwnerKey,
        entries: [...entries.values()].map((entry) => ({
          owner: entry.managerContext.owner,
          ownerKey: entry.managerContext.ownerKey,
          surface: entry.surface,
          lastTransportState: entry.lastTransportState,
          diagnostics: [...entry.diagnostics],
        })),
      };
    },
  };
}
