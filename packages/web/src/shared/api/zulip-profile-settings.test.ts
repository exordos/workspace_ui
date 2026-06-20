import { describe, expect, it, vi } from "vitest";
import { getMockZulipApi } from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();

describe("updateOwnProfileSettings", () => {
  it("updates full name and timezone via PATCH /settings", async () => {
    const { updateOwnProfileSettings } = await import("./zulip-profile-settings");
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    const result = await updateOwnProfileSettings({
      fullName: "Alice Doe",
      timezone: "Europe/Moscow",
    });

    expect(result).toEqual({ ok: true });
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/settings", {
      full_name: "Alice Doe",
      timezone: "Europe/Moscow",
    });
  });

  it("maps 400 into invalid error", async () => {
    const { updateOwnProfileSettings } = await import("./zulip-profile-settings");
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Invalid timezone" },
      raw: { statusText: "Bad Request" },
    });

    const result = await updateOwnProfileSettings({
      fullName: "Alice Doe",
      timezone: "Invalid/Zone",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      kind: "invalid",
      message: "Invalid timezone",
    });
  });

  it("maps 404/405 into unsupported error", async () => {
    const { updateOwnProfileSettings } = await import("./zulip-profile-settings");
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 405,
      data: { msg: "Method not allowed" },
      raw: { statusText: "Method Not Allowed" },
    });

    const result = await updateOwnProfileSettings({
      fullName: "Alice Doe",
      timezone: "Europe/Moscow",
    });

    expect(result).toEqual({
      ok: false,
      status: 405,
      kind: "unsupported",
      message: "Method not allowed",
    });
  });

  it("treats ignored timezone parameter as unsupported", async () => {
    const { updateOwnProfileSettings } = await import("./zulip-profile-settings");
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        ignored_parameters_unsupported: ["timezone"],
      },
      raw: { statusText: "OK" },
    });

    const result = await updateOwnProfileSettings({
      fullName: "Alice Doe",
      timezone: "Europe/Moscow",
    });

    expect(result).toEqual({
      ok: false,
      status: 200,
      kind: "unsupported",
      message: "Timezone setting is not supported by this server",
    });
  });

  it("returns transient error when there is no active instance", async () => {
    const { updateOwnProfileSettings } = await import("./zulip-profile-settings");
    const clientModule = await import("./client");
    vi.spyOn(clientModule, "getCurrentInstance").mockReturnValue(null);

    const result = await updateOwnProfileSettings({
      fullName: "Alice Doe",
      timezone: "Europe/Moscow",
    });

    expect(result).toEqual({
      ok: false,
      status: 0,
      kind: "transient",
      message: "No active instance",
    });
  });
});
