import { describe, expect, it } from "vitest";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { resolveProfileShareEntryRoute } from "./app-profile-share-redirect.lib";

const HASH = "#user/33333333-3333-4333-8333-333333333333";
function session(id: string, origin: string): WorkspaceAuthSession {
  return {
    accountId: id,
    instanceId: id,
    organizationId: id,
    organizationOrigin: origin,
    projectId: "project-1",
    userUuid: "viewer",
    login: "viewer",
    accessToken: "test-token",
    runtimeGeneration: 1,
    profile: { uuid: "viewer", username: "viewer", firstName: null, lastName: null, email: null },
  };
}
const FIRST = session("first", "https://first.example.com");
const SECOND = session("second", "https://second.example.com");

describe("profile share entry routing", () => {
  it("selects the link's server even if a different server was active", () => {
    expect(
      resolveProfileShareEntryRoute({
        sessions: [FIRST, SECOND],
        currentAccountId: FIRST.accountId,
        browserOrigin: SECOND.organizationOrigin,
        hash: HASH,
      }),
    ).toBe(`/org/second/project/project-1/inbox${HASH}`);
  });

  it("keeps the selected account when several accounts use the link's server", () => {
    const another = session("another", FIRST.organizationOrigin);
    expect(
      resolveProfileShareEntryRoute({
        sessions: [FIRST, another],
        currentAccountId: another.accountId,
        browserOrigin: FIRST.organizationOrigin,
        hash: HASH,
      }),
    ).toBe(`/org/another/project/project-1/inbox${HASH}`);
  });

  it("requests sign-in on the link's server when no matching account exists", () => {
    const route = resolveProfileShareEntryRoute({
      sessions: [FIRST],
      currentAccountId: FIRST.accountId,
      browserOrigin: SECOND.organizationOrigin,
      hash: HASH,
    });
    const url = new URL(route, SECOND.organizationOrigin);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("realm")).toBe(SECOND.organizationOrigin);
    expect(url.searchParams.get("redirectTo")).toBe(`/${HASH}`);
  });
});
