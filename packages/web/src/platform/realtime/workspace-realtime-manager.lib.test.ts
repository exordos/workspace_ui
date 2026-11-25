import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import {
  createWorkspaceRealtimeRuntimeManager,
  type WorkspaceRealtimeManagerRuntimeContext,
  type WorkspaceRealtimeManagerRuntimeFactoryOptions,
} from "./workspace-realtime-manager.lib";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeRuntimeOwner,
  WorkspaceRealtimeTransportCore,
} from "./workspace-realtime-runtime.lib";

function createOwner(
  suffix: string,
  overrides: Partial<WorkspaceRealtimeRuntimeOwner> = {},
): WorkspaceRealtimeRuntimeOwner {
  return {
    accountId: `account-${suffix}`,
    instanceId: `instance-${suffix}`,
    organizationId: `org-${suffix}`,
    projectId: `project-${suffix}`,
    userUuid: `user-${suffix}`,
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createManagerContext(
  suffix: string,
  overrides: Partial<WorkspaceRealtimeManagerRuntimeContext> = {},
): WorkspaceRealtimeManagerRuntimeContext {
  const owner = overrides.owner ?? createOwner(suffix);
  return {
    owner,
    ownerKey: overrides.ownerKey ?? `owner-key-${suffix}`,
    runtimeKey: overrides.runtimeKey ?? `runtime-key-${suffix}`,
  };
}

function createEventContext(
  runtimeContext: WorkspaceRealtimeRuntimeContext,
): WorkspaceRealtimeEventContext {
  return {
    ...runtimeContext,
    source: "websocket",
  };
}

function createApplier(applied: string[]): WorkspaceRealtimeEventApplier {
  return {
    applyEvent(event, context) {
      applied.push(`${context.surface}:${event.epoch_version}`);
    },
    skipEvent(event, reason, context) {
      applied.push(`${context.surface}:${reason}:${event.epoch_version}`);
    },
    onTransportStateChange(state, context) {
      applied.push(`${context.surface}:${state.mode}`);
    },
  };
}

function createHarness(
  startOwner?: (context: WorkspaceRealtimeRuntimeContext) => Promise<void> | undefined,
) {
  const runtimeOptions: WorkspaceRealtimeManagerRuntimeFactoryOptions<WorkspaceRealtimeManagerRuntimeContext>[] =
    [];
  const runtimes: WorkspaceRealtimeTransportCore[] = [];
  const startedContexts: WorkspaceRealtimeRuntimeContext[] = [];
  const activeApplied: string[] = [];
  const backgroundApplied: string[] = [];

  const runtimeFactory = vi.fn(
    (
      options: WorkspaceRealtimeManagerRuntimeFactoryOptions<WorkspaceRealtimeManagerRuntimeContext>,
    ): WorkspaceRealtimeTransportCore => {
      runtimeOptions.push(options);
      const runtime: WorkspaceRealtimeTransportCore = {
        start: vi.fn((context: WorkspaceRealtimeRuntimeContext) => {
          startedContexts.push(context);
          return startOwner?.(context) ?? Promise.resolve();
        }),
        stop: vi.fn(() => Promise.resolve()),
        catchUp: vi.fn(() => Promise.resolve()),
        connect: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve()),
        nudge: vi.fn(() => Promise.resolve()),
        reconnect: vi.fn(() => Promise.resolve()),
      };
      runtimes.push(runtime);
      return runtime;
    },
  );

  const manager = createWorkspaceRealtimeRuntimeManager({
    runtimeFactory,
    activeApplierFactory: () => createApplier(activeApplied),
    backgroundApplierFactory: () => createApplier(backgroundApplied),
  });

  return {
    activeApplied,
    backgroundApplied,
    manager,
    runtimeFactory,
    runtimeOptions,
    runtimes,
    startedContexts,
  };
}

describe("workspace-realtime runtime manager", () => {
  it("starts one runtime per ownerKey", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { manager, runtimeFactory, runtimes } = createHarness();

    await manager.update([first, second], first.ownerKey);

    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(runtimes).toHaveLength(2);
    expect(manager.getSnapshot().entries.map((entry) => entry.ownerKey)).toEqual([
      first.ownerKey,
      second.ownerKey,
    ]);
  });

  it("starts B and removes A while A's preparation remains pending", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    let releaseA: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const { manager, runtimes, startedContexts } = createHarness((context) =>
      context.ownerKey === first.ownerKey ? pending : undefined,
    );
    const starting = manager.update([first, second], first.ownerKey);
    try {
      expect(startedContexts.map(({ ownerKey }) => ownerKey)).toEqual([
        first.ownerKey,
        second.ownerKey,
      ]);
      await manager.update([second], second.ownerKey);
      expect(startedContexts[0]?.signal?.aborted).toBe(true);
      expect(runtimes[0]?.stop).toHaveBeenCalledWith("manager_remove");
      expect(startedContexts.at(-1)).toMatchObject({
        surface: "active",
        ownerKey: second.ownerKey,
      });
    } finally {
      releaseA?.();
      await starting;
      await manager.stopAll();
    }
  });

  it("marks active owner as active surface and other owners as background", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { manager, startedContexts } = createHarness();

    await manager.update([first, second], first.ownerKey);

    expect(startedContexts.map((context) => [context.ownerKey, context.surface])).toEqual([
      [first.ownerKey, "active"],
      [second.ownerKey, "background"],
    ]);
  });

  it("promotes and demotes owners without creating duplicate runtimes", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { manager, runtimeFactory, runtimes, startedContexts } = createHarness();

    await manager.update([first, second], first.ownerKey);
    await manager.update([first, second], second.ownerKey);

    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(runtimes[0]?.start).toHaveBeenCalledTimes(2);
    expect(runtimes[1]?.start).toHaveBeenCalledTimes(2);
    expect(startedContexts.map((context) => [context.ownerKey, context.surface])).toEqual([
      [first.ownerKey, "active"],
      [second.ownerKey, "background"],
      [first.ownerKey, "background"],
      [second.ownerKey, "active"],
    ]);
  });

  it("stops removed owner runtime", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { manager, runtimes } = createHarness();

    await manager.update([first, second], first.ownerKey);
    await manager.update([first], first.ownerKey);

    expect(runtimes[1]?.stop).toHaveBeenCalledWith("manager_remove");
    expect(manager.getSnapshot().entries.map((entry) => entry.ownerKey)).toEqual([first.ownerKey]);
  });

  it("reconnects every live runtime", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { manager, runtimes } = createHarness();

    await manager.update([first, second], first.ownerKey);
    await manager.reconnectAll("power_resume");

    expect(runtimes[0]?.reconnect).toHaveBeenCalledWith("power_resume");
    expect(runtimes[1]?.reconnect).toHaveBeenCalledWith("power_resume");
  });

  it("replaces owner runtime when runtimeKey changes", async () => {
    const first = createManagerContext("a", { runtimeKey: "token-a" });
    const refreshed = createManagerContext("a", {
      owner: first.owner,
      ownerKey: first.ownerKey,
      runtimeKey: "token-b",
    });
    const { manager, runtimeFactory, runtimes } = createHarness();

    await manager.update([first], first.ownerKey);
    await manager.update([refreshed], refreshed.ownerKey);

    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(runtimes[0]?.stop).toHaveBeenCalledWith("manager_replace", {
      waitForApplications: true,
    });
    expect(runtimes[1]?.start).toHaveBeenCalledTimes(1);
  });

  it("waits for the original runtime across multiple credential replacements", async () => {
    const first = createManagerContext("a", { runtimeKey: "token-a" });
    const second = { ...first, runtimeKey: "token-b" };
    const third = { ...first, runtimeKey: "token-c" };
    const { manager, runtimes } = createHarness();
    await manager.update([first], first.ownerKey);
    const original = runtimes[0];
    if (original == null) throw new Error("Missing first runtime");
    let releaseOriginal: (() => void) | undefined;
    vi.mocked(original.stop).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseOriginal = resolve;
        }),
    );
    const intermediate = manager.update([second], second.ownerKey);
    const replacement = manager.update([third], third.ownerKey);
    await Promise.resolve();
    expect(runtimes[1]?.start).not.toHaveBeenCalled();
    expect(runtimes[2]?.start).not.toHaveBeenCalled();
    releaseOriginal?.();
    await Promise.all([intermediate, replacement]);
    expect(runtimes[1]?.start).not.toHaveBeenCalled();
    expect(runtimes[2]?.start).toHaveBeenCalledOnce();
    await manager.stopAll();
  });

  it("routes background events to background applier only", async () => {
    const first = createManagerContext("a");
    const second = createManagerContext("b");
    const { activeApplied, backgroundApplied, manager, runtimeOptions, startedContexts } =
      createHarness();

    await manager.update([first, second], first.ownerKey);
    const backgroundContext = startedContexts.find((context) => context.surface === "background");
    expect(backgroundContext).toBeDefined();

    await runtimeOptions[1]?.applier.applyEvent(
      { epoch_version: 10, type: "unknown" } as unknown as WorkspaceRealtimeEvent,
      createEventContext(backgroundContext!),
    );

    expect(activeApplied).toEqual([]);
    expect(backgroundApplied).toEqual(["background:10"]);
  });
});
