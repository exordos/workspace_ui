/**
 * The heartbeat must never claim a status the user did not choose. These cases are
 * the whole contract: a deliberate away survives, DND survives, and measured
 * activity is what gets reported when nothing was chosen.
 */
import { describe, expect, it } from "vitest";
import {
  manualStatusFromAwayToggle,
  resolveWorkspaceHeartbeatStatus,
  workspaceStatusDecoration,
} from "./user-presence-status.lib";
import type { User } from "./user.types";

describe("resolveWorkspaceHeartbeatStatus", () => {
  it("stays silent when there is no local activity to report", () => {
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "offline",
        manualStatus: null,
        accountStatus: "active",
      }),
    ).toBeNull();
  });

  it("keeps a deliberate away instead of pushing the user back online", () => {
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "active",
        manualStatus: "idle",
        accountStatus: "idle",
      }),
    ).toBe("idle");
  });

  it("leaves do-not-disturb alone even when it was set on another device", () => {
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "active",
        manualStatus: null,
        accountStatus: "do_not_disturb",
      }),
    ).toBe("do_not_disturb");
  });

  it("reports measured activity when the user chose nothing", () => {
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "active",
        manualStatus: null,
        accountStatus: "idle",
      }),
    ).toBe("active");
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "idle",
        manualStatus: null,
        accountStatus: "active",
      }),
    ).toBe("idle");
  });

  it("prefers the local choice over do-not-disturb held by the account", () => {
    expect(
      resolveWorkspaceHeartbeatStatus({
        localPresence: "active",
        manualStatus: "idle",
        accountStatus: "do_not_disturb",
      }),
    ).toBe("idle");
  });
});

describe("manualStatusFromAwayToggle", () => {
  it("maps the away toggle onto a manual status", () => {
    expect(manualStatusFromAwayToggle(true)).toBe("idle");
    expect(manualStatusFromAwayToggle(false)).toBeNull();
  });
});

describe("workspaceStatusDecoration", () => {
  // The account is missing from the store on every start and every org switch,
  // until the roster request lands. Stating nulls there would clear a status the
  // user set days ago.
  it("states nothing while the account is not in the store", () => {
    expect(workspaceStatusDecoration(null)).toBeNull();
  });

  it("states the values once they are known", () => {
    const user = { statusEmoji: "\u{1F334}", statusText: "on holiday" } as User;
    expect(workspaceStatusDecoration(user)).toEqual({ emoji: "\u{1F334}", text: "on holiday" });
  });

  it("states explicit nulls for an account that has no status", () => {
    const user = { statusEmoji: null, statusText: null } as User;
    expect(workspaceStatusDecoration(user)).toEqual({ emoji: null, text: null });
  });
});
