import { expect, it, vi } from "vitest";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import { composeWorkspaceRealtimeAppliers } from "./workspace-realtime-applier.lib";
import type { WorkspaceRealtimeEventApplier } from "./workspace-realtime-runtime.lib";

const OWNER = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  projectId: "project-a",
  userUuid: "11111111-1111-4111-8111-111111111111",
  runtimeGeneration: 1,
};

it("waits for every composed applier before resolving event application", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstApplication = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn(() => firstApplication),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const second: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn(),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const composed = composeWorkspaceRealtimeAppliers([first, second]);
  const context = {
    owner: OWNER,
    ownerKey: "account-a:instance-a:organization-a:project-a",
    surface: "active" as const,
    source: "websocket" as const,
  };
  const event = {
    epoch_version: 1,
    type: "messages" as const,
    kind: "messages.read" as const,
    messageUuids: [],
  };

  const application = composed.applyEvent(event, context);
  let settled = false;
  void Promise.resolve(application).then(() => {
    settled = true;
  });

  expect(first.applyEvent).toHaveBeenCalledOnce();
  expect(second.applyEvent).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(settled).toBe(false);

  releaseFirst?.();
  await application;

  expect(settled).toBe(true);
});

it("composes a batch-capable applier with a sequential applier in epoch order", async () => {
  const epochs: number[] = [];
  const first: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn(),
    applyEvents: vi.fn(),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const second: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn((event) => {
      epochs.push(event.epoch_version);
    }),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const events = [1, 2, 3].map((epoch_version) => ({
    type: "messages" as const,
    kind: "messages.read" as const,
    messageUuids: [],
    epoch_version,
  }));
  const context = {
    owner: OWNER,
    ownerKey: "owner-a",
    source: "catch_up" as const,
    surface: "active" as const,
  };
  await composeWorkspaceRealtimeAppliers([first, second]).applyEvents?.(events, context);
  expect(first.applyEvents).toHaveBeenCalledWith(events, context);
  expect(first.applyEvent).not.toHaveBeenCalled();
  expect(epochs).toEqual([1, 2, 3]);
});

it("preserves mutation-kind barriers between slow and fast composed appliers", async () => {
  const order: string[] = [];
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn(async (event) => {
      order.push(`slow:${event.epoch_version}`);
      if (event.epoch_version === 1) await pending;
    }),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const fast: WorkspaceRealtimeEventApplier = {
    applyEvent: vi.fn(),
    applyEvents: vi.fn((events: readonly WorkspaceRealtimeEvent[]) => {
      order.push(`fast:${events.map((event) => event.epoch_version).join(",")}`);
    }),
    skipEvent: vi.fn(),
    onTransportStateChange: vi.fn(),
  };
  const first = {
    type: "message" as const,
    kind: "message.deleted" as const,
    epoch_version: 1,
    message: { uuid: "message-a", stream_uuid: "stream-a", topic_uuid: "topic-a" },
  };
  const next = {
    type: "messages" as const,
    kind: "messages.read" as const,
    messageUuids: [],
    epoch_version: 2,
  };
  const application = composeWorkspaceRealtimeAppliers([slow, fast]).applyEvents?.([first, next], {
    owner: OWNER,
    ownerKey: "owner",
    source: "catch_up",
    surface: "active",
  });
  await vi.waitFor(() => expect(slow.applyEvent).toHaveBeenCalledOnce());
  expect(order).toEqual(["slow:1", "fast:1"]);
  release?.();
  await application;
  expect(order).toEqual(["slow:1", "fast:1", "slow:2", "fast:2"]);
});
