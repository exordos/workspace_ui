import { describe, expect, it } from "vitest";
import { parseWorkspaceFileUrn } from "./workspace-file-urn.lib";

describe("parseWorkspaceFileUrn", () => {
  it("parses backend Workspace file URNs with metadata", () => {
    expect(
      parseWorkspaceFileUrn(
        "urn:image:33333333-3333-4333-8333-333333333333?name=photo.png&content_type=image%2Fpng&w=1280&h=720&size=1024",
      ),
    ).toEqual({
      kind: "image",
      fileUuid: "33333333-3333-4333-8333-333333333333",
      downloadPath: "/api/messenger/v1/files/33333333-3333-4333-8333-333333333333/actions/download",
      name: "photo.png",
      contentType: "image/png",
      width: 1280,
      height: 720,
      sizeBytes: 1024,
    });
  });

  it("returns null for non-Workspace file URNs", () => {
    expect(parseWorkspaceFileUrn("urn:note:33333333-3333-4333-8333-333333333333")).toBeNull();
    expect(parseWorkspaceFileUrn("https://example.com/report.pdf")).toBeNull();
  });

  it("accepts UUIDs without restricting the UUID version", () => {
    expect(
      parseWorkspaceFileUrn("urn:file:33333333-3333-7333-c333-333333333333?name=archive.zip")
        ?.fileUuid,
    ).toBe("33333333-3333-7333-c333-333333333333");
  });
});
