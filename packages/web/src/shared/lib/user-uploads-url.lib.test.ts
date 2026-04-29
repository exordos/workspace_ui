import { describe, expect, it } from "vitest";
import {
  collapseDuplicateWorkspaceV1InUrl,
  extractProtectedMessageMediaPathAndQuery,
  isExternalContentPath,
  isProtectedMessageMediaPath,
  extractUserUploadsPathAndQuery,
  rewriteProtectedMessageMediaUrlToCanonical,
  rewriteUserUploadMediaUrlToCanonical,
} from "./user-uploads-url.lib";

describe("collapseDuplicateWorkspaceV1InUrl", () => {
  it("collapses repeated /workspace/v1 before user_uploads", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/workspace/v1/workspace/v1/user_uploads/1/a.png",
      ),
    ).toBe("https://sys.t/workspace/v1/user_uploads/1/a.png");
  });

  it("collapses multiple repeats", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/workspace/v1/workspace/v1/workspace/v1/user_uploads/x",
      ),
    ).toBe("https://sys.t/workspace/v1/user_uploads/x");
  });
});

describe("extractUserUploadsPathAndQuery", () => {
  it("strips host and keeps path+query for absolute upload URLs", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "https://sys.platform.tokens.team/user_uploads/2/ab/file.png?q=1",
        "https://localhost",
      ),
    ).toBe("/user_uploads/2/ab/file.png?q=1");
  });

  it("removes /api/v1 prefix before user_uploads", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "https://gw.example.com/api/v1/user_uploads/x/y.png",
        "https://localhost",
      ),
    ).toBe("/user_uploads/x/y.png");
  });

  it("strips gateway segments before user_uploads (Vite dev /workspace/v1/...)", () => {
    expect(
      extractUserUploadsPathAndQuery(
        "http://localhost:5173/workspace/v1/user_uploads/2/ff/a/image.png?q=1",
        "http://localhost:5173",
      ),
    ).toBe("/user_uploads/2/ff/a/image.png?q=1");
  });
});

describe("extractProtectedMessageMediaPathAndQuery", () => {
  it("keeps external_content path+query for absolute preview URLs", () => {
    expect(
      extractProtectedMessageMediaPathAndQuery(
        "https://sys.platform.tokens.team/external_content/thumbnail?url=1",
        "https://localhost",
      ),
    ).toBe("/external_content/thumbnail?url=1");
  });

  it("drops gateway segments before external_content", () => {
    expect(
      extractProtectedMessageMediaPathAndQuery(
        "http://localhost:5173/workspace/v1/external_content/abc.png",
        "http://localhost:5173",
      ),
    ).toBe("/external_content/abc.png");
  });
});

describe("isProtectedMessageMediaPath", () => {
  it("detects user_uploads and external_content paths", () => {
    expect(isProtectedMessageMediaPath("/user_uploads/1/a.png")).toBe(true);
    expect(isProtectedMessageMediaPath("/external_content/abc.png")).toBe(true);
    expect(isExternalContentPath("/external_content/abc.png")).toBe(true);
    expect(isProtectedMessageMediaPath("/static/logo.png")).toBe(false);
  });
});

describe("rewriteUserUploadMediaUrlToCanonical", () => {
  it("rewrites wrong host to canonical uploads base", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://sys.platform.tokens.team/user_uploads/1/a.png",
        "https://zulip.tokens.team",
      ),
    ).toBe("https://zulip.tokens.team/user_uploads/1/a.png");
  });

  it("preserves non-upload absolute URLs", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://cdn.example.com/static/logo.png",
        "https://zulip.tokens.team",
      ),
    ).toBe("https://cdn.example.com/static/logo.png");
  });

  it("applies gateway prefix from canonical base", () => {
    expect(
      rewriteUserUploadMediaUrlToCanonical(
        "https://sys.platform.test/user_uploads/1/a.png",
        "https://api.test/workspace/v1",
      ),
    ).toBe("https://api.test/workspace/v1/user_uploads/1/a.png");
  });
});

describe("rewriteProtectedMessageMediaUrlToCanonical", () => {
  it("rewrites external_content URL to canonical realm base", () => {
    expect(
      rewriteProtectedMessageMediaUrlToCanonical(
        "https://sys.platform.tokens.team/external_content/preview.png",
        "https://zulip.tokens.team",
      ),
    ).toBe("https://zulip.tokens.team/external_content/preview.png");
  });
});
