// Tests for current-user runtime capabilities from stream-binding roles.
import { describe, expect, it } from "vitest";
import type { WorkspaceStreamRole } from "~/shared/api/messenger.types";
import { resolveCurrentUserChannelCapabilities } from "./stream-member-management-permissions.lib";

function expectCapabilities(role: WorkspaceStreamRole | null | undefined, allowed: boolean): void {
  expect(resolveCurrentUserChannelCapabilities({ currentUserStreamRole: role })).toEqual({
    canAddSubscribers: allowed,
    canRemoveSubscribers: allowed,
    canEditChannelMetadata: allowed,
    canArchiveChannel: allowed,
  });
}

describe("resolveCurrentUserChannelCapabilities", () => {
  it("allows stream owners to manage members and metadata", () => {
    expectCapabilities("owner", true);
  });

  it("allows stream administrators to manage members and metadata", () => {
    expectCapabilities("administrator", true);
  });

  it("denies regular stream roles", () => {
    expectCapabilities("member", false);
    expectCapabilities("moderator", false);
    expectCapabilities("guest", false);
  });

  it("denies when current stream role is unknown", () => {
    expectCapabilities(null, false);
    expectCapabilities(undefined, false);
  });
});
