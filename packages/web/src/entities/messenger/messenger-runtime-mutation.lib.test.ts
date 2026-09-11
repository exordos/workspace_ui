import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WorkspaceAuthSession,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  resetMessengerRuntimeMutations,
  runMessengerRuntimeMutation,
} from "./messenger-runtime-mutation.lib";

function session(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://workspace.example.com",
    projectId: "11111111-1111-4111-8111-111111111111",
    userUuid: "22222222-2222-4222-8222-222222222222",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    login: "alice",
    profile: {
      uuid: "22222222-2222-4222-8222-222222222222",
      username: "alice",
      firstName: "Alice",
      lastName: "Stone",
      email: "alice@example.com",
    },
    expiresAtMs: Date.now() + 60_000,
    runtimeGeneration: 7,
    ...overrides,
  };
}

function setCurrentSession(current: WorkspaceAuthSession | null): void {
  useWorkspaceAuthStore.setState({
    sessions: current == null ? [] : [current],
    currentAccountId: current?.accountId ?? null,
    runtimeGeneration: current?.runtimeGeneration ?? 0,
  });
}

function currentRuntime(): WorkspaceRuntimeContext {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (context == null) throw new Error("Expected a current Workspace runtime");
  return context;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("messenger runtime mutations", () => {
  beforeEach(() => {
    setCurrentSession(session());
    resetMessengerRuntimeMutations();
  });

  afterEach(() => {
    resetMessengerRuntimeMutations();
    setCurrentSession(null);
  });

  it("keeps independent mutations active until their own work settles", async () => {
    const signals: AbortSignal[] = [];
    const firstWork = deferred();
    const secondWork = deferred();

    const first = runMessengerRuntimeMutation(currentRuntime(), async (signal) => {
      signals.push(signal);
      await firstWork.promise;
      return "first";
    });
    const second = runMessengerRuntimeMutation(currentRuntime(), async (signal) => {
      signals.push(signal);
      await secondWork.promise;
      return "second";
    });

    await Promise.resolve();
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(false);
    expect(signals[1]?.aborted).toBe(false);
    firstWork.resolve();
    await expect(first).resolves.toBe("first");
    expect(signals[1]?.aborted).toBe(false);
    secondWork.resolve();
    await expect(second).resolves.toBe("second");
  });

  it("keeps an active mutation across updates that preserve the same runtime", async () => {
    const work = deferred();
    let mutationSignal: AbortSignal | undefined;
    const mutation = runMessengerRuntimeMutation(currentRuntime(), async (signal) => {
      mutationSignal = signal;
      await work.promise;
      return "applied";
    });

    await Promise.resolve();
    setCurrentSession(
      session({
        accessToken: "rotated-access-token",
        expiresAtMs: Date.now() + 120_000,
      }),
    );

    expect(mutationSignal?.aborted).toBe(false);
    work.resolve();
    await expect(mutation).resolves.toBe("applied");
  });

  it("aborts active mutations when the runtime owner changes", async () => {
    let mutationSignal: AbortSignal | undefined;
    const mutation = runMessengerRuntimeMutation(currentRuntime(), (signal) => {
      mutationSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(abortedError()), { once: true });
      });
    });

    await Promise.resolve();
    setCurrentSession(
      session({
        projectId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(mutationSignal?.aborted).toBe(true);
    await expect(mutation).rejects.toMatchObject({
      name: "AbortError",
      message: "The messenger runtime changed",
    });
  });

  it("rejects immediately on owner change when the underlying mutation ignores abort", async () => {
    const work = deferred();
    const mutation = runMessengerRuntimeMutation(currentRuntime(), () =>
      work.promise.then(() => "late-result"),
    );

    await Promise.resolve();
    setCurrentSession(
      session({
        projectId: "44444444-4444-4444-8444-444444444444",
      }),
    );

    await expect(mutation).rejects.toMatchObject({ name: "AbortError" });

    work.resolve();
    await expect(work.promise).resolves.toBeUndefined();
    await expect(mutation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not start a mutation after an immediate runtime change", async () => {
    const mutation = vi.fn(() => Promise.resolve("late-result"));
    const guardedMutation = runMessengerRuntimeMutation(currentRuntime(), mutation);

    setCurrentSession(session({ runtimeGeneration: 8 }));

    await expect(guardedMutation).rejects.toMatchObject({ name: "AbortError" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("handles a late underlying rejection after the runtime guard aborts", async () => {
    let rejectUnderlying: (reason: Error) => void = () => undefined;
    const underlying = new Promise<never>((_resolve, reject) => {
      rejectUnderlying = reject;
    });
    const mutation = runMessengerRuntimeMutation(currentRuntime(), () => underlying);
    await Promise.resolve();

    setCurrentSession(session({ runtimeGeneration: 8 }));
    await expect(mutation).rejects.toMatchObject({ name: "AbortError" });

    const lateRejection = expect(underlying).rejects.toThrow("late failure");
    rejectUnderlying(new Error("late failure"));
    await lateRejection;
  });

  it("removes a settled mutation from runtime-change cleanup", async () => {
    let mutationSignal: AbortSignal | undefined;
    const mutation = runMessengerRuntimeMutation(currentRuntime(), (signal) => {
      mutationSignal = signal;
      return Promise.resolve("settled");
    });

    await expect(mutation).resolves.toBe("settled");
    setCurrentSession(
      session({
        organizationId: "organization-b",
      }),
    );

    expect(mutationSignal?.aborted).toBe(false);
  });

  it("aborts active mutations when the runtime generation changes", async () => {
    const signals: AbortSignal[] = [];
    const mutation = runMessengerRuntimeMutation(currentRuntime(), (signal) => {
      signals.push(signal);
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(abortedError()), { once: true });
      });
    });

    await Promise.resolve();
    setCurrentSession(session({ runtimeGeneration: 8 }));

    expect(signals[0]?.aborted).toBe(true);
    await expect(mutation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a mutation captured for an inactive runtime", async () => {
    const staleRuntime = currentRuntime();
    setCurrentSession(session({ accountId: "account-b", runtimeGeneration: 8 }));
    const mutation = vi.fn(() => Promise.resolve("applied"));

    await expect(runMessengerRuntimeMutation(staleRuntime, mutation)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mutation).not.toHaveBeenCalled();
  });
});

function abortedError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}
