import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/applications/messenger/model/messages/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createMessagesIndexSource } from "../messages/messages-consumers";
import { createChatsCatalogSource } from "./chats";
import { useMessengerStore } from "./messenger.model";

const runtime: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance",
  organizationId: "organization",
  organizationOrigin: "https://workspace.example.test",
  projectId: "project",
  userUuid: "user",
  accessToken: "synthetic-token",
  runtimeGeneration: 1,
};

afterEach(() => {
  useMessengerStore.getState().clear();
  useWorkspaceMessageStore.getState().clear();
});

it("keeps unchanged snapshots stable and prevents an old reader from regaining access after A → B → A", () => {
  const ownerKey = workspaceRuntimeOwnerKey(runtime);
  useMessengerStore.getState().startBootstrap(ownerKey);
  useWorkspaceMessageStore.getState().setOwner(ownerKey, false);
  let current = runtime;
  const getRuntime = () => current;
  const chats = createChatsCatalogSource(runtime, getRuntime);
  const messages = createMessagesIndexSource(runtime, getRuntime);
  const catalog = chats.getSnapshot();
  const index = messages.getSnapshot();
  expect(catalog.ownerKey).toBe(ownerKey);
  expect(index.ownerKey).toBe(ownerKey);
  const catalogChanged = vi.fn();
  const unsubscribe = chats.subscribe(catalogChanged);
  try {
    useMessengerStore.getState().setRealtimeCursor(ownerKey, 1);
    expect(chats.getSnapshot()).toBe(catalog);
    expect(messages.getSnapshot()).toBe(index);
    expect(catalogChanged).not.toHaveBeenCalled();

    current = { ...runtime, accountId: "account-b", runtimeGeneration: 2 };
    expect(chats.getSnapshot().ownerKey).toBeNull();
    expect(messages.getSnapshot().ownerKey).toBeNull();

    current = { ...runtime, runtimeGeneration: 3 };
    expect(chats.getSnapshot().ownerKey).toBeNull();
    expect(messages.getSnapshot().ownerKey).toBeNull();
    expect(createChatsCatalogSource(current, getRuntime).getSnapshot()).toBe(catalog);
    expect(createMessagesIndexSource(current, getRuntime).getSnapshot()).toBe(index);
  } finally {
    unsubscribe();
  }
});
