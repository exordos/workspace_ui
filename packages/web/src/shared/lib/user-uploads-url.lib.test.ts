import { describe, expect, it } from "vitest";
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractProtectedMessageMediaPathAndQuery,
  isExternalContentPath,
  isProtectedMessageMediaPath,
  isWorkspaceFileDownloadPath,
  extractUserUploadsPathAndQuery,
  rewriteProtectedMessageMediaUrlToCanonical,
  rewriteUserUploadMediaUrlToCanonical,
} from "./user-uploads-url.lib";

describe("collapseDuplicateWorkspaceV1InUrl", () => {
  it("collapses repeated /api/workspace/v1 before user_uploads", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/api/workspace/v1/api/workspace/v1/user_uploads/1/a.png",
      ),
    ).toBe("https://sys.t/api/workspace/v1/user_uploads/1/a.png");
  });

  it("collapses multiple repeats", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/api/workspace/v1/api/workspace/v1/api/workspace/v1/user_uploads/x",
      ),
    ).toBe("https://sys.t/api/workspace/v1/user_uploads/x");
  });
});

describe("extractUserUploadsPathAndQuery", () => {
  it("strips host and keeps path+query for absolute upload URLs", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "https://sys.platform.genesis-core.team/user_uploads/2/ab/file.png?q=1",
        "https://localhost",
      ),
    ).toBe("/user_uploads/2/ab/file.png?q=1");
  });

  it("removes gateway prefix before user_uploads", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "https://gw.example.com/api/workspace/v1/user_uploads/x/y.png",
        "https://localhost",
      ),
    ).toBe("/user_uploads/x/y.png");
  });

  it("strips gateway segments before user_uploads (Vite dev /api/workspace/v1/...)", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "http://localhost:5173/api/workspace/v1/user_uploads/2/ff/a/image.png?q=1",
        "http://localhost:5173",
      ),
    ).toBe("/user_uploads/2/ff/a/image.png?q=1");
  });
});

describe("extractProtectedMessageMediaPathAndQuery", () => {
  it("keeps external_content path+query for absolute preview URLs", () => {
    expect(
      extractProtectedMessageMediaPathAndQuery(
        "https://sys.platform.genesis-core.team/external_content/thumbnail?url=1",
        "https://localhost",
      ),
    ).toBe("/external_content/thumbnail?url=1");
  });

  it("keeps Workspace file download path+query for absolute API URLs", () => {
    expect(
      extractProtectedMessageMediaPathAndQuery(
        "http://localhost:5173/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download?inline=1",
        "http://localhost:5173",
      ),
    ).toBe(
      "/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download?inline=1",
    );
  });
});

describe("isProtectedMessageMediaPath", () => {
  it("detects user_uploads, external_content, and Workspace file downloads", () => {
    const filePath =
      "/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download";

    expect(isProtectedMessageMediaPath("/user_uploads/1/a.png")).toBe(true);
    expect(isProtectedMessageMediaPath("/external_content/abc.png")).toBe(true);
    expect(isProtectedMessageMediaPath(filePath)).toBe(true);
    expect(isExternalContentPath("/external_content/abc.png")).toBe(true);
    expect(isWorkspaceFileDownloadPath(filePath)).toBe(true);
    expect(isWorkspaceFileDownloadPath("/api/workspace/v1/messenger/files/333/actions/meta")).toBe(
      false,
    );
    expect(isProtectedMessageMediaPath("/static/logo.png")).toBe(false);
  });
});

describe("rewriteUserUploadMediaUrlToCanonical", () => {
  it("rewrites wrong host to canonical uploads base", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://sys.platform.genesis-core.team/user_uploads/1/a.png",
        "https://messenger.genesis-core.team",
      ),
    ).toBe("https://messenger.genesis-core.team/user_uploads/1/a.png");
  });

  it("preserves non-upload absolute URLs", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://cdn.example.com/static/logo.png",
        "https://messenger.genesis-core.team",
      ),
    ).toBe("https://cdn.example.com/static/logo.png");
  });

  it("applies gateway prefix from canonical base", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://sys.platform.test/user_uploads/1/a.png",
        "https://api.test/api/workspace/v1",
      ),
    ).toBe("https://api.test/api/workspace/v1/user_uploads/1/a.png");
  });
});

describe("rewriteProtectedMessageMediaUrlToCanonical", () => {
  it("rewrites external_content URL to canonical realm base", () => {
    expect(
      rewriteProtectedMessageMediaUrlToCanonical(
        "https://sys.platform.genesis-core.team/external_content/preview.png",
        "https://messenger.genesis-core.team",
      ),
    ).toBe("https://messenger.genesis-core.team/external_content/preview.png");
  });
});
