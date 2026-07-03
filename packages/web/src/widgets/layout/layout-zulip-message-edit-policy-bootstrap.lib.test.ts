import { afterEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  applyZulipRegisterMessageEditPolicy,
  messageEditPolicyFromZulipRegister,
} from "./layout-zulip-message-edit-policy-bootstrap.lib";

describe("layout-zulip-message-edit-policy-bootstrap", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
  });

  it("builds current user message edit policy from legacy Zulip register metadata", () => {
    expect(
      messageEditPolicyFromZulipRegister({
        realm_allow_message_editing: false,
        realm_message_content_edit_limit_seconds: null,
      }),
    ).toEqual({
      allowMessageEditing: false,
      messageContentEditLimitSeconds: null,
    });
  });

  it("applies legacy Zulip register metadata to the store read by MessageBubble", () => {
    applyZulipRegisterMessageEditPolicy({
      realm_allow_message_editing: true,
      realm_message_content_edit_limit_seconds: 600,
    });

    expect(useChatListStore.getState().currentUserMessageEditPolicy).toEqual({
      allowMessageEditing: true,
      messageContentEditLimitSeconds: 600,
    });
  });

  it("clears stale edit policy when register metadata is absent", () => {
    useChatListStore.getState().setCurrentUserMessageEditPolicy({
      allowMessageEditing: false,
      messageContentEditLimitSeconds: 60,
    });

    applyZulipRegisterMessageEditPolicy({});

    expect(useChatListStore.getState().currentUserMessageEditPolicy).toBeUndefined();
  });
});
