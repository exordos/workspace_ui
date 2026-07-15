import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import type { WorkspaceEvent, WorkspaceEventObjectType } from "~/shared/types/workspace-event";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";
import type { StartCredentialEventLoopFn } from "./layout-multi-org-event-streams.types";

const INSTANCES: WorkspaceInstance[] = [
  {
    id: "inst-1",
    realm: "https://a.example.com",
    login: "a@example.com",
    authType: "iam",
    iamAccessToken: "token-1",
  },
  {
    id: "inst-2",
    realm: "https://b.example.com",
    login: "b@example.com",
    authType: "iam",
    iamAccessToken: "token-2",
  },
  {
    id: "inst-3",
    realm: "https://c.example.com",
    login: "c@example.com",
    authType: "iam",
    iamAccessToken: "token-3",
  },
];

function event(epochVersion: number, objectType: WorkspaceEventObjectType): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: `event-${epochVersion}`,
    epoch_version: epochVersion,
    project_id: "project-1",
    user_uuid: "user-1",
    object_type: objectType,
    action: "updated",
    created_at: "2026-07-15T10:00:00Z",
    updated_at: "2026-07-15T10:00:00Z",
    payload: { kind: `${objectType}.updated` },
  };
}

describe("startInactiveInstanceEventStreams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts loops only for inactive instances and stops all on cleanup", () => {
    const stopOne = vi.fn();
    const stopTwo = vi.fn();
    const startLoop = vi
      .fn<StartCredentialEventLoopFn>()
      .mockReturnValueOnce(stopOne)
      .mockReturnValueOnce(stopTwo);

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      refreshUnreadForInstance: vi.fn(),
      startEventLoop: startLoop,
    });

    expect(startLoop).toHaveBeenCalledTimes(2);
    expect(startLoop.mock.calls[0]?.[0].credentials).toMatchObject({
      realm: "https://b.example.com",
    });
    expect(startLoop.mock.calls[1]?.[0].credentials).toMatchObject({
      realm: "https://c.example.com",
    });

    stop();
    expect(stopOne).toHaveBeenCalledTimes(1);
    expect(stopTwo).toHaveBeenCalledTimes(1);
  });

  it("passes saved workspace org origin to inactive instance credentials", () => {
    const startLoop = vi.fn<StartCredentialEventLoopFn>().mockReturnValue(() => {});
    const instances: WorkspaceInstance[] = [
      INSTANCES[0]!,
      {
        ...INSTANCES[1]!,
        realm: "https://canonical.example.com",
        workspaceOrgOrigin: "https://gateway.example.com",
      },
    ];

    const stop = startInactiveInstanceEventStreams({
      instances,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      refreshUnreadForInstance: vi.fn(),
      startEventLoop: startLoop,
    });

    expect(startLoop).toHaveBeenCalledTimes(1);
    expect(startLoop.mock.calls[0]?.[0].credentials).toMatchObject({
      realm: "https://canonical.example.com",
      workspaceOrgOrigin: "https://gateway.example.com",
      login: "b@example.com",
      accessToken: "token-2",
    });

    stop();
  });

  it("debounces unread refresh for event bursts", async () => {
    const startLoop = vi.fn<StartCredentialEventLoopFn>();
    const refreshUnreadForInstance = vi.fn().mockResolvedValue(undefined);
    const loops: Parameters<StartCredentialEventLoopFn>[0][] = [];

    startLoop.mockImplementation((options) => {
      loops.push(options);
      return () => {};
    });

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      debounceMs: 100,
      refreshUnreadForInstance,
      startEventLoop: startLoop,
    });

    expect(loops).toHaveLength(2);
    const first = loops[0]!;
    first.onEvent(event(1, "message"));
    first.onEvent(event(2, "message"));
    first.onEvent(event(3, "message_reaction"));

    await vi.advanceTimersByTimeAsync(99);
    expect(refreshUnreadForInstance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshUnreadForInstance).toHaveBeenCalledTimes(1);
    expect(refreshUnreadForInstance).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inst-2" }),
    );

    first.onEvent(event(4, "user"));
    await vi.advanceTimersByTimeAsync(200);
    expect(refreshUnreadForInstance).toHaveBeenCalledTimes(1);

    stop();
  });

  it("cancels pending refresh timers on cleanup", async () => {
    const loops: Parameters<StartCredentialEventLoopFn>[0][] = [];
    const startLoop = vi.fn<StartCredentialEventLoopFn>().mockImplementation((options) => {
      loops.push(options);
      return () => {};
    });
    const refreshUnreadForInstance = vi.fn().mockResolvedValue(undefined);

    const stop = startInactiveInstanceEventStreams({
      instances: INSTANCES,
      currentInstanceId: "inst-1",
      enabled: true,
      online: true,
      debounceMs: 100,
      refreshUnreadForInstance,
      startEventLoop: startLoop,
    });

    loops[0]!.onBadQueue?.();
    stop();

    await vi.advanceTimersByTimeAsync(200);
    expect(refreshUnreadForInstance).not.toHaveBeenCalled();
  });
});
