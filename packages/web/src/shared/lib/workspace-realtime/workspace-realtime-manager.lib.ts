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
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
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
  stopAll(reason?: string): Promise<void>;
  getSnapshot(): WorkspaceRealtimeManagerSnapshot;
}

interface RuntimeEntry<TContext extends WorkspaceRealtimeManagerRuntimeContext> {
  // Entry живёт на ownerKey: один проект может переключаться active/background без второго socket.
  runtime: WorkspaceRealtimeTransportCore;
  managerContext: TContext;
  controller: AbortController;
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
): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      const entry = getEntry();
      return delegateBySurface(entry, context).applyEvent(event, context);
    },
    skipEvent(event, reason, context) {
      const entry = getEntry();
      return delegateBySurface(entry, context).skipEvent(event, reason, context);
    },
    onTransportStateChange(state, context) {
      const entry = getEntry();
      entry.lastTransportState = state;
      return delegateBySurface(entry, context).onTransportStateChange(state, context);
    },
  };
}

export function createWorkspaceRealtimeRuntimeManager<
  TContext extends WorkspaceRealtimeManagerRuntimeContext,
>(options: WorkspaceRealtimeManagerOptions<TContext>): WorkspaceRealtimeRuntimeManager<TContext> {
  const entries = new Map<string, RuntimeEntry<TContext>>();
  let activeOwnerKey: string | null = null;
  let operationQueue = Promise.resolve();

  function isOwnerCurrent(owner: WorkspaceRealtimeRuntimeOwner): boolean {
    const entry = [...entries.values()].find((candidate) =>
      isSameOwner(candidate.managerContext.owner, owner),
    );
    if (entry == null || entry.controller.signal.aborted) return false;
    if (!isSameRuntimeOwner(entry.managerContext.owner, owner)) return false;
    return options.isOwnerCurrent?.(owner) ?? true;
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
    const activeApplier = options.activeApplierFactory({ isOwnerCurrent });
    // Фон сейчас не пишет в messengerStore: он только даёт transport-у принять событие и сдвинуть cursor.
    const backgroundApplier =
      options.backgroundApplierFactory?.({ isOwnerCurrent }) ??
      createWorkspaceRealtimeNoopApplier();
    const routingApplier = createRoutingApplier<TContext>(() => {
      if (entry == null) {
        throw new Error("Workspace realtime manager entry is not initialized");
      }
      return entry;
    });

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
      entry.surface !== nextSurface ||
      !isSameRuntimeOwner(entry.managerContext.owner, nextContext.owner)
    );
  }

  async function startEntry(
    entry: RuntimeEntry<TContext>,
    managerContext: TContext,
    surface: WorkspaceRealtimeSurface,
  ): Promise<void> {
    entry.managerContext = managerContext;
    entry.surface = surface;
    await entry.runtime.start(
      buildRuntimeContext(managerContext, surface, entry.controller.signal),
    );
  }

  async function stopEntry(entry: RuntimeEntry<TContext>, reason: string): Promise<void> {
    entry.controller.abort();
    await entry.runtime.stop(reason);
  }

  async function applyUpdate(
    contexts: TContext[],
    nextActiveOwnerKey: string | null,
  ): Promise<void> {
    activeOwnerKey = nextActiveOwnerKey;
    const nextOwnerKeys = new Set(contexts.map((context) => context.ownerKey));

    for (const [ownerKey, entry] of entries) {
      if (nextOwnerKeys.has(ownerKey)) continue;
      entries.delete(ownerKey);
      await stopEntry(entry, "manager_remove");
    }

    for (const managerContext of contexts) {
      const surface: WorkspaceRealtimeSurface =
        managerContext.ownerKey === nextActiveOwnerKey ? "active" : "background";
      const existing = entries.get(managerContext.ownerKey);
      if (existing == null) {
        const entry = createEntry(managerContext, surface);
        entries.set(managerContext.ownerKey, entry);
        await startEntry(entry, managerContext, surface);
        continue;
      }

      if (shouldReplaceRuntime(existing, managerContext)) {
        await stopEntry(existing, "manager_replace");
        const entry = createEntry(managerContext, surface);
        entries.set(managerContext.ownerKey, entry);
        await startEntry(entry, managerContext, surface);
        continue;
      }

      if (shouldRestartRuntime(existing, managerContext, surface)) {
        await startEntry(existing, managerContext, surface);
        continue;
      }

      existing.managerContext = managerContext;
    }
  }

  function enqueue(operation: () => Promise<void>): Promise<void> {
    // React effects могут прийти подряд: start/stop/update выполняем строго по очереди,
    // чтобы поздний stop не закрыл только что созданный socket.
    const nextOperation = operationQueue.then(operation, operation);
    operationQueue = nextOperation.catch(() => undefined);
    return nextOperation;
  }

  return {
    update(contexts, nextActiveOwnerKey) {
      return enqueue(() => applyUpdate(contexts, nextActiveOwnerKey));
    },
    stopAll(reason = "manager_stop") {
      return enqueue(async () => {
        activeOwnerKey = null;
        const currentEntries = [...entries.values()];
        entries.clear();
        for (const entry of currentEntries) {
          await stopEntry(entry, reason);
        }
      });
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
