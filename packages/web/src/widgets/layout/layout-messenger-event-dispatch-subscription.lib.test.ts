import { describe, expect, it } from "vitest";
import type { MessengerEvent, MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { applySubscriptionMetadataField } from "./layout-messenger-event-dispatch-subscription.lib";

interface TestMetadataRow {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
}

function createRow(): TestMetadataRow {
  return {
    streamUuid: "00000000-0000-4000-8000-000000000001",
    name: "general",
  };
}

function createEvent(value: unknown): MessengerEvent {
  return {
    id: 1,
    type: "subscription",
    value,
  };
}

describe("applySubscriptionMetadataField", () => {
  it("updates boolean metadata fields", () => {
    const row = createRow();

    applySubscriptionMetadataField(row, "is_archived", createEvent(true));
    expect(row.isArchived).toBe(true);

    applySubscriptionMetadataField(row, "invite_only", createEvent(false));
    expect(row.inviteOnly).toBe(false);
  });

  it("updates group setting metadata fields", () => {
    const row = createRow();
    const groupValue = { direct_members: [42], direct_subgroups: [] };

    const properties = [
      ["can_add_subscribers_group", "canAddSubscribersGroup"],
      ["can_remove_subscribers_group", "canRemoveSubscribersGroup"],
      ["can_administer_channel_group", "canAdministerChannelGroup"],
      ["can_resolve_topics_group", "canResolveTopicsGroup"],
      ["can_move_messages_out_of_channel_group", "canMoveMessagesOutOfChannelGroup"],
    ] as const;

    for (const [property, field] of properties) {
      applySubscriptionMetadataField(row, property, createEvent(groupValue));
      expect(row[field]).toEqual(groupValue);
    }
  });

  it("ignores unknown properties and invalid values", () => {
    const row = createRow();

    applySubscriptionMetadataField(row, "name", createEvent("renamed"));
    applySubscriptionMetadataField(row, "is_archived", createEvent("yes"));
    applySubscriptionMetadataField(row, "can_add_subscribers_group", createEvent("invalid"));

    expect(row).toEqual(createRow());
  });
});
