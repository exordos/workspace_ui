// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  deriveWorkspaceDownloadFileName,
  triggerWorkspaceBrowserDownload,
  workspaceFileDownloadKey,
} from "./chat-workspace-file-download.lib";

describe("chat workspace file download helpers", () => {
  it("uses Workspace file UUID as the download store key", () => {
    expect(workspaceFileDownloadKey("33333333-3333-4333-8333-333333333333")).toBe(
      "workspace-file:33333333-3333-4333-8333-333333333333",
    );
  });

  it("prefers Content-Disposition filename over markdown hint", () => {
    expect(
      deriveWorkspaceDownloadFileName({
        fileUuid: "33333333-3333-4333-8333-333333333333",
        fileNameHint: "hint.txt",
        contentDisposition: 'attachment; filename="server-report.pdf"',
      }),
    ).toBe("server-report.pdf");
  });

  it("revokes temporary blob URL after triggering browser download", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    triggerWorkspaceBrowserDownload(new Blob(["file"], { type: "text/plain" }), "report.txt");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});
