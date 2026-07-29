import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import type { MessengerBinaryResult } from "~/shared/api/messenger-transport.internal";
import {
  buildWorkspaceDefaultAvatarUrn,
  isWorkspaceAvatarUrn,
  resolveWorkspaceAvatarSource,
} from "./workspace-avatar-urn.lib";
import { loadWorkspaceAvatar } from "./workspace-avatar.lib";

vi.mock("~/shared/api/messenger-files.api", () => ({
  downloadWorkspaceFile: vi.fn(),
}));

const downloadMock = vi.mocked(downloadWorkspaceFile);
const FILE_UUID = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function avatarOptions(overrides: Partial<Parameters<typeof loadWorkspaceAvatar>[0]> = {}) {
  return {
    avatarUrn: `urn:image:${FILE_UUID}`,
    ownerKey: "account:a:project:p:user:u",
    runtimeGeneration: 3,
    requestOptions: { accessToken: "token" },
    ...overrides,
  };
}

beforeEach(() => {
  downloadMock.mockReset();
  vi.restoreAllMocks();
});

describe("Workspace avatar resolution", () => {
  it("builds the same default Gravatar URN as the Workspace backend", () => {
    expect(
      buildWorkspaceDefaultAvatarUrn(
        " MyEmailAddress@example.com ",
        "a225223c-637c-4afa-918f-5f2798b9305f",
      ),
    ).toBe("urn:gravatar:0bc83cb571cd1c50ba6f3e8a78ef1346");
    expect(buildWorkspaceDefaultAvatarUrn(null, "a225223c-637c-4afa-918f-5f2798b9305f")).toBe(
      "urn:gravatar:a62015bc6e3423354e6073cb8aef7a48",
    );
  });

  it("resolves Gravatar hash URNs to the secure Gravatar URL", () => {
    const hash = "7ec7606c46a14a7ef514d1f1f9038823";
    const avatarUrn = `urn:gravatar:${hash}`;

    expect(resolveWorkspaceAvatarSource(avatarUrn)).toEqual({
      kind: "external",
      url: `https://secure.gravatar.com/avatar/${hash}?d=identicon&s=500`,
    });
    expect(isWorkspaceAvatarUrn(avatarUrn)).toBe(true);
    expect(isWorkspaceAvatarUrn("urn:gravatar:not-a-hash")).toBe(false);
  });

  it("accepts only safe https URL avatars", () => {
    expect(resolveWorkspaceAvatarSource("urn:url:https://cdn.example/avatar.png")).toEqual({
      kind: "external",
      url: "https://cdn.example/avatar.png",
    });
    expect(resolveWorkspaceAvatarSource("urn:url:http://cdn.example/avatar.png")).toEqual({
      kind: "external",
      url: "http://cdn.example/avatar.png",
    });
    expect(
      resolveWorkspaceAvatarSource("urn:url:https://user:secret@cdn.example/avatar.png"),
    ).toBeNull();
  });

  it("keeps image avatars as file references instead of returning a URN URL", () => {
    expect(resolveWorkspaceAvatarSource(`urn:image:${FILE_UUID}`)).toEqual({
      kind: "file",
      fileUuid: FILE_UUID,
    });
    expect(isWorkspaceAvatarUrn(`urn:image:${FILE_UUID}`)).toBe(true);
    expect(isWorkspaceAvatarUrn("urn:image:not-a-uuid")).toBe(false);
  });

  it("downloads image avatars through the Workspace file endpoint and revokes the object URL", async () => {
    const blob = new Blob(["avatar"], { type: "image/png" });
    downloadMock.mockResolvedValueOnce({ blob, headers: new Headers() });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const controller = new AbortController();

    const resource = await loadWorkspaceAvatar({
      ...avatarOptions(),
      signal: controller.signal,
    });

    expect(resource?.url).toBe("blob:avatar");
    expect(downloadWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(downloadWorkspaceFile).toHaveBeenCalledWith(
      { accessToken: "token", signal: expect.any(AbortSignal) },
      FILE_UUID,
    );
    expect(downloadMock.mock.calls[0]?.[0]?.signal).not.toBe(controller.signal);
    resource?.dispose();
    resource?.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("joins simultaneous avatar loads through the shared file loader", async () => {
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    createObjectUrl.mockReturnValueOnce("blob:avatar-1").mockReturnValueOnce("blob:avatar-2");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const first = loadWorkspaceAvatar(avatarOptions());
    const second = loadWorkspaceAvatar(avatarOptions());

    expect(downloadWorkspaceFile).toHaveBeenCalledTimes(1);

    request.resolve({ blob: new Blob(["avatar"], { type: "image/png" }), headers: new Headers() });
    const [firstResource, secondResource] = await Promise.all([first, second]);

    expect(firstResource?.url).toBe("blob:avatar-1");
    expect(secondResource?.url).toBe("blob:avatar-2");
    firstResource?.dispose();
    secondResource?.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it("does not join avatar loads from different runtime scopes", async () => {
    downloadMock.mockResolvedValue({
      blob: new Blob(["avatar"], { type: "image/png" }),
      headers: new Headers(),
    });
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:avatar-1")
      .mockReturnValueOnce("blob:avatar-2");

    const first = loadWorkspaceAvatar(avatarOptions());
    const second = loadWorkspaceAvatar(
      avatarOptions({ ownerKey: "account:b:project:p:user:u", runtimeGeneration: 4 }),
    );

    expect(downloadWorkspaceFile).toHaveBeenCalledTimes(2);
    const resources = await Promise.all([first, second]);
    resources.forEach((resource) => resource?.dispose());
  });
});
