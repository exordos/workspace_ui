import { expect, it, vi } from "vitest";
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
