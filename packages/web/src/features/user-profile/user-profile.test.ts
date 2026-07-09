import { afterEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { clearRealmProfileFieldsCache } from "./user-profile.api";
import { useUserProfileStore } from "./user-profile.model";

describe("useUserProfileStore", () => {
  afterEach(() => {
    useUserProfileStore.getState().clear();
    useUsersStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
    clearRealmProfileFieldsCache();
  });

  it("starts idle with no profile", () => {
    const state = useUserProfileStore.getState();
    expect(state.status).toBe("idle");
    expect(state.profile).toBeNull();
    expect(state.error).toBeNull();
  });

  it("finishes without a legacy Zulip profile request during Workspace cutover", async () => {
    await useUserProfileStore.getState().loadProfile(42);

    const state = useUserProfileStore.getState();
    expect(state.status).toBe("done");
    expect(state.profile).toBeNull();
    expect(state.error).toBeNull();
    expect(useUsersStore.getState().getUser("42")).toBeUndefined();
  });

  it("sets error when user id validation fails", async () => {
    await useUserProfileStore.getState().loadProfile(0);

    const state = useUserProfileStore.getState();
    expect(state.status).toBe("error");
    expect(state.profile).toBeNull();
  });

  it("does not apply stale profile after organization switch and clear", async () => {
    useInstancesStore.setState({
      instances: [{ id: "inst-a" }, { id: "inst-b" }],
      currentInstanceId: "inst-a",
      activeOrgEpoch: 0,
    });

    const pending = useUserProfileStore.getState().loadProfile(42);
    useInstancesStore.getState().setCurrentInstanceId("inst-b");
    useUserProfileStore.getState().clear();

    await pending;

    const state = useUserProfileStore.getState();
    expect(state.status).toBe("idle");
    expect(state.profile).toBeNull();
    expect(state.error).toBeNull();
    expect(useUsersStore.getState().getUser("42")).toBeUndefined();
  });

  it("resets profile and status", async () => {
    await useUserProfileStore.getState().loadProfile(42);
    useUserProfileStore.getState().clear();

    const state = useUserProfileStore.getState();
    expect(state.status).toBe("idle");
    expect(state.profile).toBeNull();
    expect(state.error).toBeNull();
  });

  it("transitions through loading to done", async () => {
    const statuses: string[] = [];
    const unsub = useUserProfileStore.subscribe((s) => statuses.push(s.status));

    await useUserProfileStore.getState().loadProfile(42);
    unsub();

    expect(statuses).toContain("loading");
    expect(statuses).toContain("done");
  });
});
