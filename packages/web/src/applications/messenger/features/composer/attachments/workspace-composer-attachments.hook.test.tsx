import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceComposerAttachments } from "./workspace-composer-attachments.hook";
import type {
  WorkspaceComposerAttachmentScope,
  WorkspaceComposerAttachmentServerMetadata,
  WorkspaceComposerAttachmentTransport,
} from "./workspace-composer-attachments.types";

const SCOPE_A: WorkspaceComposerAttachmentScope = {
  ownerKey: "owner-a",
  runtimeGeneration: 1,
  scopeKey: "topic-a",
};

function file(name: string): File {
  return new File([name], name, { type: "text/plain" });
}

function metadata(name: string): WorkspaceComposerAttachmentServerMetadata {
  return {
    uuid: `uuid-${name}`,
    markdownLink: `[${name}](urn:file:${name})`,
    contentType: "text/plain",
    name,
    sizeBytes: name.length,
  };
}

function StrictModeWrapper({ children }: Readonly<PropsWithChildren>) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useWorkspaceComposerAttachments", () => {
  it("keeps a live image preview through StrictMode replay and revokes it on real unmount", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:strict-image");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const transport: WorkspaceComposerAttachmentTransport = {
      upload: (uploadFile) => Promise.resolve(metadata(uploadFile.name)),
      delete: () => Promise.resolve(),
    };
    const { result, unmount } = renderHook(
      () => useWorkspaceComposerAttachments({ scope: SCOPE_A, transport }),
      { wrapper: StrictModeWrapper },
    );
    const image = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "strict.png",
      { type: "image/png" },
    );

    act(() => {
      result.current.add([image]);
    });
    await waitFor(() => expect(result.current.attachments[0]?.status).toBe("ready"));

    expect(result.current.attachments[0]?.previewUrl).toBe("blob:strict-image");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith("blob:strict-image"));
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode effect replay and disposes ready files on real unmount", async () => {
    const upload = vi.fn((uploadFile: File) => Promise.resolve(metadata(uploadFile.name)));
    const deleteAttachment = vi.fn(() => Promise.resolve());
    const transport: WorkspaceComposerAttachmentTransport = {
      upload,
      delete: deleteAttachment,
    };
    const { result, unmount } = renderHook(
      () => useWorkspaceComposerAttachments({ scope: SCOPE_A, transport }),
      { wrapper: StrictModeWrapper },
    );

    act(() => {
      result.current.add([file("strict.txt")]);
    });

    await waitFor(() => expect(result.current.attachments[0]?.status).toBe("ready"));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.current).not.toHaveProperty("controller");

    unmount();

    await waitFor(() =>
      expect(deleteAttachment).toHaveBeenCalledWith(
        metadata("strict.txt"),
        expect.objectContaining({ scope: SCOPE_A }),
      ),
    );
  });

  it("switches to a complete new scope during rerender without exposing the old queue", async () => {
    const upload = vi.fn((uploadFile: File) => Promise.resolve(metadata(uploadFile.name)));
    const deleteAttachment = vi.fn(() => Promise.resolve());
    const transport: WorkspaceComposerAttachmentTransport = {
      upload,
      delete: deleteAttachment,
    };
    const { result, rerender } = renderHook(
      ({ scope }: { scope: WorkspaceComposerAttachmentScope }) =>
        useWorkspaceComposerAttachments({ scope, transport }),
      { initialProps: { scope: SCOPE_A } },
    );
    act(() => {
      result.current.add([file("old-scope.txt")]);
    });
    await waitFor(() => expect(result.current.attachments[0]?.status).toBe("ready"));

    const scopeB: WorkspaceComposerAttachmentScope = {
      ownerKey: "owner-a",
      runtimeGeneration: 1,
      scopeKey: "topic-b",
    };
    rerender({ scope: scopeB });

    expect(result.current.attachments).toEqual([]);
    act(() => {
      result.current.add([file("new-scope.txt")]);
    });
    await waitFor(() => expect(result.current.attachments[0]?.status).toBe("ready"));
    expect(upload).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "new-scope.txt" }),
      expect.objectContaining({ scope: scopeB }),
    );
    await waitFor(() =>
      expect(deleteAttachment).toHaveBeenCalledWith(
        metadata("old-scope.txt"),
        expect.objectContaining({ scope: SCOPE_A }),
      ),
    );
  });
});
