import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftFixture } from "~/test/factories";
import {
  createDraft,
  deleteDraftOnServer,
  DraftPreconditionError,
  fetchDraftsPage,
  updateDraftOnServer,
} from "./draft.api";

const api = vi.hoisted(() => ({
  getWithBase: vi.fn(),
  postJsonWithBase: vi.fn(),
  putJsonWithBase: vi.fn(),
  deleteWithBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  getMessengerGatewayApiBaseForCurrentInstance: () => "/api/workspace/v1/messenger",
  messengerApi: api,
}));

function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  const raw = new Response(data == null ? null : JSON.stringify(data), { status, headers });
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: raw.headers,
    data,
    raw,
    durationMs: 0,
  };
}

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DRAFT_UUID = "33333333-3333-4333-8333-333333333333";

describe("Workspace Draft API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads updated_at-desc pages and returns the continuation marker", async () => {
    const draft = createDraftFixture({ uuid: DRAFT_UUID });
    api.getWithBase.mockResolvedValue(
      response([draft], 200, { "X-Pagination-Marker": DRAFT_UUID }),
    );

    await expect(
      fetchDraftsPage({ streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID, pageLimit: 25 }),
    ).resolves.toMatchObject({
      drafts: [{ uuid: DRAFT_UUID, etag: '"1"' }],
      nextPageMarker: DRAFT_UUID,
    });
    expect(api.getWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/drafts/",
      {
        sort_key: "updated_at",
        sort_dir: "desc",
        stream_uuid: STREAM_UUID,
        topic_uuid: TOPIC_UUID,
        page_limit: "25",
      },
      undefined,
    );
  });

  it("creates idempotently with the client UUID and markdown payload", async () => {
    const draft = createDraftFixture({ uuid: DRAFT_UUID, revision: 2 });
    api.postJsonWithBase.mockResolvedValue(response(draft, 201, { ETag: '"2"' }));

    const result = await createDraft({
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      payload: { kind: "markdown", content: "hello" },
    });

    expect(result.etag).toBe('"2"');
    expect(api.postJsonWithBase).toHaveBeenCalledWith("/api/workspace/v1/messenger", "/drafts/", {
      uuid: DRAFT_UUID,
      stream_uuid: STREAM_UUID,
      topic_uuid: TOPIC_UUID,
      payload: { kind: "markdown", content: "hello" },
    });
  });

  it("sends only payload and If-Match for PUT", async () => {
    api.putJsonWithBase.mockResolvedValue(
      response(createDraftFixture({ uuid: DRAFT_UUID, revision: 3 }), 200, { ETag: '"3"' }),
    );

    await updateDraftOnServer(
      DRAFT_UUID,
      { payload: { kind: "markdown", content: "updated" } },
      '"2"',
    );

    expect(api.putJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/drafts/${DRAFT_UUID}`,
      { payload: { kind: "markdown", content: "updated" } },
      { "If-Match": '"2"' },
    );
  });

  it("exposes the direct 412 current snapshot and response ETag", async () => {
    const current = createDraftFixture({ uuid: DRAFT_UUID, revision: 4, content: "remote" });
    api.putJsonWithBase.mockResolvedValue(response(current, 412, { ETag: '"4"' }));

    const error = await updateDraftOnServer(
      DRAFT_UUID,
      { payload: { kind: "markdown", content: "local" } },
      '"2"',
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DraftPreconditionError);
    expect((error as DraftPreconditionError).current).toMatchObject({
      etag: '"4"',
      draft: { uuid: DRAFT_UUID, revision: 4, etag: '"4"' },
    });
  });

  it("uses If-Match for DELETE", async () => {
    api.deleteWithBase.mockResolvedValue(response(null, 204));

    await deleteDraftOnServer(DRAFT_UUID, '"5"');

    expect(api.deleteWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      `/drafts/${DRAFT_UUID}`,
      undefined,
      { "If-Match": '"5"' },
    );
  });

  it("rejects server snapshots with local-only revision zero", async () => {
    api.getWithBase.mockResolvedValue(
      response([createDraftFixture({ uuid: DRAFT_UUID, revision: 0 })]),
    );
    await expect(fetchDraftsPage()).rejects.toThrow(/revision/);
  });
});
