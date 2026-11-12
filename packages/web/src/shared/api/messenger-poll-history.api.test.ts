import { describe, expect, it, vi } from "vitest";
import { getMessages, getMessagesPage } from "./messenger-messages.api";

const message = {
  uuid: "a93dca35-3061-4748-bda4-7f6f8c660ea5",
  project_id: "22222222-2222-4222-8222-222222222222",
  stream_uuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
  topic_uuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
  author_uuid: "11111111-1111-4111-8111-111111111111",
  user_uuid: "11111111-1111-4111-8111-111111111111",
  payload: { kind: "markdown", content: "A normal message beside a poll" },
  read: false,
  pinned: false,
  starred: false,
  is_own: true,
  reactions: {},
  reaction_users: {},
  created_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
};
const question = "00000000-0000-4000-8000-000000000001";
const first = "00000000-0000-4000-8000-000000000002";
const second = "00000000-0000-4000-8000-000000000003";
const poll = {
  ...message,
  uuid: "a93dca35-3061-4748-bda4-7f6f8c660ea6",
  payload: {
    kind: "poll",
    questions: [
      {
        uuid: question,
        text: "When?",
        options: [
          { uuid: first, text: "Today" },
          { uuid: second, text: "Tomorrow" },
        ],
      },
    ],
    multiple_answers: false,
    is_anonymous: false,
    allow_revote: true,
    results_visibility: "after_vote",
    allow_adding_options: false,
    closes_at: null,
    closed_at: null,
  },
  poll_state: {
    revision: 1,
    is_closed: false,
    voter_count: 0,
    questions: [
      { question_uuid: question, voter_count: 0, option_counts: { [first]: 0, [second]: 0 } },
    ],
    my_votes: [],
  },
};

describe("history containing native polls", () => {
  it.each(["list", "page"] as const)("preserves every row in a mixed %s response", async (mode) => {
    const history = [message, poll];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(history), {
        headers: { "Content-Type": "application/json", "X-Pagination-Marker": poll.uuid },
      }),
    );
    const options = { accessToken: "test-token", fetchImpl };
    if (mode === "list") {
      await expect(getMessages(options)).resolves.toEqual(history);
    } else {
      await expect(getMessagesPage(options)).resolves.toMatchObject({
        items: history,
        nextPageMarker: poll.uuid,
      });
    }
  });
});
