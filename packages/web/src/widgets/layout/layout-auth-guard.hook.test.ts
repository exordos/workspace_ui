import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useLayoutAuthGuard } from "./layout-auth-guard.hook";

const onPowerResume = vi.hoisted(() => vi.fn((_handler: () => void) => () => {}));
vi.mock("~/shared/lib/power", () => ({ onPowerResume }));

const NOW = new Date("2026-11-23T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1_000;

function createSession(accountId = "account-a"): Omit<WorkspaceAuthSession, "runtimeGeneration"> {
  return {
    accountId,
    instanceId: `instance-${accountId}`,
    organizationId: "workspace.example.com",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid: accountId,
    login: `${accountId}@example.com`,
    accessToken: "access",
    refreshToken: "refresh",
    profile: {
      uuid: accountId,
      username: accountId,
      firstName: null,
      lastName: null,
      email: null,
    },
  };
}

function keyFor(session: Omit<WorkspaceAuthSession, "runtimeGeneration">): string {
  return `workspace-auth-last-activity-at:${workspaceRuntimeOwnerKey(session)}`;
}

function signIn(accountId?: string) {
  const session = createSession(accountId);
  useWorkspaceAuthStore.getState().setSession(session);
  return session;
}

function dispatchKeyboard(trusted: boolean) {
  const listener = vi
    .mocked(window.addEventListener)
    .mock.calls.findLast(([type]) => type === "keydown")?.[1];
  if (typeof listener !== "function") throw new Error("Missing activity listener");
  const event = {
    isTrusted: trusted,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
  act(() => {
    listener.call(window, event as unknown as Event);
  });
  return event;
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe("Workspace inactivity sign-out", () => {
  beforeEach(() => {
    useWorkspaceAuthStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
    onPowerResume.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(window, "addEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(keyFor(createSession()));
    localStorage.removeItem(keyFor(createSession("account-b")));
    act(() => {
      useSettingsStore.getState().resetToDefaults();
      useWorkspaceAuthStore.getState().clear();
    });
  });

  it("uses the current preset and does not credit token refresh or touch other accounts", () => {
    const background = signIn("account-b");
    const selected = signIn();
    renderHook(useLayoutAuthGuard);

    advance(2 * 24 * HOUR);
    act(() => {
      useWorkspaceAuthStore.getState().updateTokens(selected.accountId, { accessToken: "updated" });
    });
    advance(24 * HOUR);

    const state = useWorkspaceAuthStore.getState();
    expect(state.currentAccountId).toBe(selected.accountId);
    expect(state.reauthRequiredAccounts).toMatchObject([{ accountId: selected.accountId }]);
    expect(state.reauthRequiredAccounts[0]).not.toHaveProperty("accessToken");
    expect(state.sessions).toMatchObject([{ accountId: background.accountId }]);
  });

  it("extends the absolute deadline only for trusted input in a focused page", () => {
    const selected = signIn();
    useSettingsStore.getState().setAuthIdleTimeout("6h");
    renderHook(useLayoutAuthGuard);

    advance(5 * HOUR);
    dispatchKeyboard(true);
    expect(localStorage.getItem(keyFor(selected))).toBe(String(NOW + 5 * HOUR));

    advance(5 * HOUR);
    dispatchKeyboard(false);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    dispatchKeyboard(true);
    advance(HOUR);

    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBeNull();
  });

  it("flushes activity on unmount and uses it after restarting", () => {
    const selected = signIn();
    useSettingsStore.getState().setAuthIdleTimeout("6h");
    const guard = renderHook(useLayoutAuthGuard);
    advance(10_000);
    dispatchKeyboard(true);
    expect(localStorage.getItem(keyFor(selected))).toBe(String(NOW));
    guard.unmount();
    expect(localStorage.getItem(keyFor(selected))).toBe(String(NOW + 10_000));

    vi.setSystemTime(NOW + 6 * HOUR + 10_000);
    renderHook(useLayoutAuthGuard);

    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBeNull();
  });

  it("disables expiry for Never while continuing to observe activity", () => {
    signIn();
    useSettingsStore.getState().setAuthIdleTimeout("never");
    renderHook(useLayoutAuthGuard);

    advance(10 * 24 * HOUR);
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).not.toBeNull();
    dispatchKeyboard(true);
    act(() => useSettingsStore.getState().setAuthIdleTimeout("6h"));
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).not.toBeNull();
    advance(6 * HOUR);
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBeNull();
  });

  it.each(["focus", "visibilitychange", "pageshow", "power", "gesture"])(
    "checks the absolute deadline after a suspended timer on %s",
    (trigger) => {
      signIn();
      useSettingsStore.getState().setAuthIdleTimeout("6h");
      renderHook(useLayoutAuthGuard);

      vi.setSystemTime(NOW + 7 * HOUR);
      if (trigger === "gesture") {
        const input = dispatchKeyboard(true);
        expect(input.preventDefault).toHaveBeenCalledOnce();
        expect(input.stopImmediatePropagation).toHaveBeenCalledOnce();
      } else {
        act(() => {
          if (trigger === "power") onPowerResume.mock.calls[0]?.[0]();
          else if (trigger === "visibilitychange") document.dispatchEvent(new Event(trigger));
          else window.dispatchEvent(new Event(trigger));
        });
      }

      expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBeNull();
    },
  );

  it("keeps activity scoped to the selected account and rejects old callbacks", () => {
    const first = signIn();
    useSettingsStore.getState().setAuthIdleTimeout("6h");
    renderHook(useLayoutAuthGuard);
    const oldResume = onPowerResume.mock.calls[0]?.[0];

    vi.setSystemTime(NOW + 5 * HOUR);
    act(() => {
      signIn("account-b");
    });
    vi.setSystemTime(NOW + 7 * HOUR);
    dispatchKeyboard(true);
    act(() => oldResume?.());

    expect(useWorkspaceAuthStore.getState().sessions).toHaveLength(2);
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId(first.accountId));
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toBeNull();
    expect(useWorkspaceAuthStore.getState().sessions[0]?.accountId).toBe("account-b");
  });

  it("starts a fresh deadline after successful reauthorization of the same account", () => {
    const selected = signIn();
    useSettingsStore.getState().setAuthIdleTimeout("6h");
    renderHook(useLayoutAuthGuard);
    advance(6 * HOUR);

    const state = useWorkspaceAuthStore.getState();
    const [account] = state.reauthRequiredAccounts;
    expect(account).toBeDefined();
    act(() => {
      state.restoreReauthorizedSession(account!, { ...selected, accessToken: "restored" });
    });

    expect(useWorkspaceAuthStore.getState().getCurrentSession()?.accessToken).toBe("restored");
  });
});
