import { describe, expect, it } from "vitest";
import type { UserRecord } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import { userIdStorageKey } from "~/shared/lib/user-id.lib";
import { testMessageId } from "~/test/factories";
import { filterSearchMessages } from "./search-modal-filters.lib";

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id: MockMessage["id"] | number;
};

function msg(overrides: MockMessageOverrides): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id),
    sender_id: 1,
    content: "hi",
    timestamp: 1_700_000_000,
    channel: "general",
    subject: "topic",
    sender_full_name: "Alice",
    stream_uuid: null,
    ...rest,
  };
}

function user(id: number, name: string): UserRecord {
  return {
    user_id: id,
    full_name: name,
    email: `${name}@x.test`,
  };
}

describe("filterSearchMessages", () => {
  it("returns all when filters are empty", () => {
    const list = [msg({ id: 1 })];
    const users = new Map<string, UserRecord>([[userIdStorageKey(1), user(1, "Alice")]]);
    expect(filterSearchMessages(list, users, "", "", "")).toEqual(list);
  });

  it("filters by stream name substring", () => {
    const list = [msg({ id: 1, channel: "engineering" }), msg({ id: 2, channel: "random" })];
    const users = new Map<string, UserRecord>();
    expect(filterSearchMessages(list, users, "eng", "", "").map((m) => m.id)).toEqual([
      testMessageId(1),
    ]);
  });

  it("filters by date", () => {
    const ts = Date.parse("2024-06-01T12:00:00Z") / 1000;
    const list = [msg({ id: 1, timestamp: ts })];
    const users = new Map<string, UserRecord>();
    expect(filterSearchMessages(list, users, "", "", "2024-06-01").length).toBe(1);
    expect(filterSearchMessages(list, users, "", "", "2024-06-02").length).toBe(0);
  });
});
