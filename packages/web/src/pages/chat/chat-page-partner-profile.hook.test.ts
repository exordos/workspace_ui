import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatPartnerProfileHydration } from "./chat-page-partner-profile.hook";

const fetchUser = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-users", () => ({
  fetchUser,
}));

describe("useChatPartnerProfileHydration", () => {
  afterEach(() => {
    fetchUser.mockReset();
    useUsersStore.getState().clear();
    useChatListStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
    vi.restoreAllMocks();
  });

  it("does not merge stale partner profile after organization switch", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-a", realm: "https://a.test", email: "a@test.com", apiKey: "a-key" },
        { id: "inst-b", realm: "https://b.test", email: "b@test.com", apiKey: "b-key" },
      ],
      currentInstanceId: "inst-a",
      activeOrgEpoch: 0,
    });

    let resolveUser:
      | ((
          value: {
            user_id: number;
            full_name: string;
            email: string;
            avatar_url: string;
            is_active: boolean;
          },
        ) => void)
      | undefined;
    fetchUser.mockImplementation(() => Promise.resolve(null));
    fetchUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        }),
    );
    const patchSpy = vi.spyOn(useChatListStore.getState(), "patchPersonalDmRowLabelsForUser");

    const { unmount } = renderHook(() =>
      useChatPartnerProfileHydration({
        partnerUserId: 7,
        isDmView: true,
        isGroupDmView: false,
      }),
    );

    await waitFor(() => {
      expect(fetchUser).toHaveBeenCalledWith(7, { signal: expect.any(AbortSignal) });
    });

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("inst-b");
    });

    await waitFor(() => {
      expect(fetchUser).toHaveBeenNthCalledWith(2, 7, { signal: expect.any(AbortSignal) });
    });

    expect(resolveUser).toBeTypeOf("function");
    resolveUser!({
      user_id: 7,
      full_name: "Alice",
      email: "alice@test.com",
      avatar_url: "https://a.test/avatar.png",
      is_active: true,
    });

    await waitFor(() => {
      expect(useUsersStore.getState().getUser(7)).toBeUndefined();
    });
    expect(patchSpy).not.toHaveBeenCalled();
    unmount();
  });
});
