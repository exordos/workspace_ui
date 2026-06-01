import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { resolveCanResolveTopics } from "./topic-resolve-permissions.lib";

const neverInGroup = () => false;

describe("resolveCanResolveTopics", () => {
  it("allows member via realm group membership", () => {
    const result = resolveCanResolveTopics({
      currentUserId: 507,
      roleCode: UserRole.Member,
      realmCanResolveTopicsGroup: 42,
      isUserInGroupSetting: (setting, userId) => setting === 42 && userId === 507,
    });

    expect(result.allowed).toBe(true);
    expect(result.source).toBe("realm_group");
    expect(result.inRealmGroup).toBe(true);
  });

  it("denies member when realm group is restrictive", () => {
    const result = resolveCanResolveTopics({
      currentUserId: 507,
      roleCode: UserRole.Member,
      realmCanResolveTopicsGroup: 99,
      isUserInGroupSetting: neverInGroup,
    });

    expect(result.allowed).toBe(false);
    expect(result.source).toBe("denied");
  });

  it("falls back to member role when realm metadata is missing", () => {
    const result = resolveCanResolveTopics({
      currentUserId: 507,
      roleCode: UserRole.Member,
      isUserInGroupSetting: neverInGroup,
    });

    expect(result.allowed).toBe(true);
    expect(result.source).toBe("member_role_fallback");
  });

  it("prefers stream-level group over realm when channel override is set", () => {
    const result = resolveCanResolveTopics({
      currentUserId: 10,
      roleCode: UserRole.Member,
      realmCanResolveTopicsGroup: 1,
      streamCanResolveTopicsGroup: 2,
      isUserInGroupSetting: (setting, userId) => setting === 2 && userId === 10,
    });

    expect(result.allowed).toBe(true);
    expect(result.source).toBe("stream_group");
  });
});
