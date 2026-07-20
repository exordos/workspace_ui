import { describe, expect, it, vi } from "vitest";
import { createDraft, deleteDraft, getDraftsPage, updateDraft } from "./messenger-drafts.api";
import { type MessengerApiError } from "./messenger-transport.internal";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const DRAFT_UUID = "ca14d274-0057-4a9a-a34b-fb1174be6a17";

const draft = {
  uuid: DRAFT_UUID,
  project_id: PROJECT_UUID,
  user_uuid: USER_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  payload: { kind: "markdown" as const, content: "Черновик" },
  revision: 3,
  created_at: "2026-07-17T08:00:00Z",
  updated_at: "2026-07-17T08:01:00Z",
};

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function fetchMock(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): ReturnType<typeof vi.fn<typeof fetch>> {
  const mock = vi.fn<typeof fetch>();
  mock.mockImplementation(() => Promise.resolve(response(body, status, headers)));
  return mock;
}

function call(mock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const first = mock.mock.calls[0];
  if (first == null) throw new Error("Expected request");
  return first;
}

describe("messenger drafts API", () => {
  it("loads the sorted paginated list and derives an ETag from revision", async () => {
    const mock = fetchMock([draft], 200, { "X-Pagination-Marker": "next" });
    await expect(
      getDraftsPage(
        { accessToken: "token", fetchImpl: mock },
        {
          pageLimit: 20,
          pageMarker: DRAFT_UUID,
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
          sortKey: "updated_at",
          sortDir: "desc",
        },
      ),
    ).resolves.toMatchObject({ items: [{ draft, etag: '"3"' }], nextPageMarker: "next" });
    expect(call(mock)[0]).toBe(
      `/api/workspace/v1/messenger/drafts/?page_limit=20&page_marker=${DRAFT_UUID}&stream_uuid=${STREAM_UUID}&topic_uuid=${TOPIC_UUID}&sort_key=updated_at&sort_dir=desc`,
    );
  });

  it("sends If-Match for update and delete", async () => {
    const update = fetchMock(draft, 200, { ETag: '"3"' });
    await updateDraft(
      { accessToken: "token", fetchImpl: update },
      DRAFT_UUID,
      { payload: draft.payload },
      '"2"',
    );
    expect(call(update)[1]?.headers).toMatchObject({ "if-match": '"2"' });

    const remove = fetchMock(null, 204);
    await deleteDraft({ accessToken: "token", fetchImpl: remove }, DRAFT_UUID, '"3"');
    expect(call(remove)[1]?.headers).toMatchObject({ "if-match": '"3"' });
  });

  it("retains a 412 snapshot and ETag in MessengerApiError", async () => {
    const mock = fetchMock(draft, 412, { ETag: '"3"' });
    await expect(
      createDraft(
        { accessToken: "token", fetchImpl: mock },
        {
          uuid: DRAFT_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          payload: draft.payload,
        },
      ),
    ).rejects.toMatchObject({ status: 412, data: draft } satisfies Partial<MessengerApiError>);
  });
});
