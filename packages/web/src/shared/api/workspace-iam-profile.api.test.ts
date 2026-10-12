import { describe, expect, it, vi } from "vitest";
import { MessengerApiError } from "./messenger-transport.internal";
import { parseWorkspaceIamProfile, workspaceIamProfileApi } from "./workspace-iam-profile.api";

const UUID = "11111111-1111-4111-8111-111111111111";
const dto = {
  uuid: UUID,
  username: "alice",
  first_name: "Alice",
  last_name: null,
  phone: "+123",
  description: "Hello",
  email: "alice@example.com",
};

describe("IAM profile adapter", () => {
  it("uses the actor's IAM endpoint and serializes only changed fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(dto)));
    const profile = await workspaceIamProfileApi.update(
      {
        organizationOrigin: "https://org.example",
        userUuid: UUID,
        accessToken: "token",
        fetchImpl,
      },
      { firstName: "Alice", lastName: null, phone: "" },
    );
    expect(profile).toMatchObject({ username: "alice", firstName: "Alice", lastName: null });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://org.example/api/core/v1/iam/users/${UUID}`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ first_name: "Alice", last_name: null, phone: "" }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("rejects another user's response and malformed field values", () => {
    expect(() => parseWorkspaceIamProfile({ ...dto, uuid: "other" }, UUID)).toThrow();
    expect(() => parseWorkspaceIamProfile({ ...dto, first_name: 42 }, UUID)).toThrow();
  });

  it("preserves HTTP status without falling back to a Workspace mutation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(
      workspaceIamProfileApi.update(
        {
          organizationOrigin: "https://org.example",
          userUuid: UUID,
          accessToken: "token",
          fetchImpl,
        },
        { username: "new" },
      ),
    ).rejects.toBeInstanceOf(MessengerApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
