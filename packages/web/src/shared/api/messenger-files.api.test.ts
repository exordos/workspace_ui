import { describe, expect, it, vi } from "vitest";
import { downloadWorkspaceFile } from "./messenger-files.api";

const FILE_UUID = "33333333-3333-4333-8333-333333333333";

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

describe("messenger files API", () => {
  it("downloads Workspace file bytes through the confirmed file download endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response("workspace file", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="report.txt"',
        },
      }),
    );

    const result = await downloadWorkspaceFile(
      { accessToken: "access-token", fetchImpl: fetchMock },
      FILE_UUID,
    );

    expect(await result.blob.text()).toBe("workspace file");
    expect(result.headers.get("content-disposition")).toContain("report.txt");
    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/messenger/v1/files/${FILE_UUID}/actions/download`);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({
      Accept: "*/*",
      Authorization: "Bearer access-token",
    });
  });
});
