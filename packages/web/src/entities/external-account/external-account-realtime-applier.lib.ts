import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import type { WorkspaceRealtimeEvent } from "~/shared/api/messenger.types";
import {
  readWorkspaceExternalAccountCache,
  replaceWorkspaceExternalAccountCache,
} from "~/shared/lib/workspace-external-account-cache-db";
import type {
  WorkspaceRealtimeEventApplier,
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  adaptCachedExternalAccount,
  adaptWorkspaceExternalAccountDto,
  toWorkspaceExternalAccountCacheProfile,
} from "./external-account-adapters.lib";
import { useExternalAccountsStore } from "./external-account.model";
import type { ExternalAccount } from "./external-account.types";

type ExternalAccountRealtimeEvent = Extract<WorkspaceRealtimeEvent, { type: "external_account" }>;
const deletedAccountUuidsByOwnerKey = new Map<string, Set<string>>();

function deletedAccountsForOwner(ownerKey: string): Set<string> {
  const existing = deletedAccountUuidsByOwnerKey.get(ownerKey);
  if (existing != null) return existing;
  const created = new Set<string>();
  deletedAccountUuidsByOwnerKey.set(ownerKey, created);
  return created;
}

export function markExternalAccountLocallyDeleted(ownerKey: string, accountUuid: string): void {
  deletedAccountsForOwner(ownerKey).add(accountUuid);
}

export interface ExternalAccountRealtimeCache {
  read(ownerKey: string): Promise<ExternalAccount[]>;
  replace(
    ownerKey: string,
    accounts: readonly ExternalAccount[],
    isOwnerCurrent: () => boolean,
  ): Promise<void>;
}

export interface ExternalAccountRealtimeApplierOptions {
  surface: "active" | "background";
  isOwnerCurrent?: (owner: WorkspaceRealtimeRuntimeOwner) => boolean;
  cache?: ExternalAccountRealtimeCache;
}

const defaultCache: ExternalAccountRealtimeCache = {
  async read(ownerKey) {
    const cachedAccounts = await readWorkspaceExternalAccountCache(ownerKey);
    return cachedAccounts.map(adaptCachedExternalAccount);
  },
  replace(ownerKey, accounts, isOwnerCurrent) {
    return replaceWorkspaceExternalAccountCache(
      ownerKey,
      accounts.map(toWorkspaceExternalAccountCacheProfile),
      isOwnerCurrent,
    );
  },
};

function isCurrentContext(
  context: WorkspaceRealtimeEventContext,
  options: ExternalAccountRealtimeApplierOptions,
): boolean {
  return (
    context.surface === options.surface &&
    context.signal?.aborted !== true &&
    (options.isOwnerCurrent?.(context.owner) ?? true)
  );
}

function applyEventToAccounts(
  accounts: readonly ExternalAccount[],
  event: ExternalAccountRealtimeEvent,
): ExternalAccount[] {
  const current = accounts.find((account) => account.uuid === event.external_account.uuid);
  if (current != null && current.revision > event.external_account.revision) {
    return [...accounts];
  }
  if (event.kind === "external_account.deleted") {
    return accounts.filter((account) => account.uuid !== event.external_account.uuid);
  }

  const next = adaptWorkspaceExternalAccountDto(event.external_account);
  return current == null
    ? [...accounts, next]
    : accounts.map((account) => (account.uuid === next.uuid ? next : account));
}

async function persistEvent(
  event: ExternalAccountRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
  options: ExternalAccountRealtimeApplierOptions,
): Promise<void> {
  const cache = options.cache ?? defaultCache;
  const accounts = await cache.read(context.ownerKey);
  if (!isCurrentContext(context, options)) return;
  const deletedAccountUuids = deletedAccountsForOwner(context.ownerKey);
  if (event.kind === "external_account.deleted") {
    deletedAccountUuids.add(event.external_account.uuid);
  } else if (event.kind === "external_account.created") {
    deletedAccountUuids.delete(event.external_account.uuid);
  }
  await cache.replace(
    context.ownerKey,
    applyEventToAccounts(accounts, event).filter(
      (account) => !deletedAccountUuids.has(account.uuid),
    ),
    () => isCurrentContext(context, options),
  );
}

function applyActiveEvent(
  event: ExternalAccountRealtimeEvent,
  context: WorkspaceRealtimeEventContext,
): void {
  const store = useExternalAccountsStore.getState();
  if (store.ownerKey !== context.ownerKey) return;

  const current = store.accounts.find((account) => account.uuid === event.external_account.uuid);
  if (current != null && current.revision > event.external_account.revision) return;

  if (event.kind === "external_account.deleted") {
    markExternalAccountLocallyDeleted(context.ownerKey, event.external_account.uuid);
    store.removeAccountForOwner(context.ownerKey, event.external_account.uuid);
    useExternalChatsStore
      .getState()
      .clearAccount(
        `${context.ownerKey}:external-account:${event.external_account.uuid}`,
        event.external_account.uuid,
      );
    return;
  }

  const deletedAccountUuids = deletedAccountsForOwner(context.ownerKey);
  if (event.kind === "external_account.created") {
    deletedAccountUuids.delete(event.external_account.uuid);
  }
  if (deletedAccountUuids.has(event.external_account.uuid)) return;

  store.upsertAccountForOwner(
    context.ownerKey,
    adaptWorkspaceExternalAccountDto(event.external_account),
  );
}

export function createExternalAccountRealtimeApplier(
  options: ExternalAccountRealtimeApplierOptions,
): WorkspaceRealtimeEventApplier {
  let persistenceQueue = Promise.resolve();

  return {
    applyEvent(event, context) {
      if (event.type !== "external_account" || !isCurrentContext(context, options)) return;

      if (options.surface === "active") applyActiveEvent(event, context);
      persistenceQueue = persistenceQueue
        .then(() => persistEvent(event, context, options))
        .catch(() => undefined);
    },
    skipEvent() {},
    onTransportStateChange() {},
  };
}

export const externalAccountRealtimeTestUtils = {
  applyEventToAccounts,
  resetDeletionFences() {
    deletedAccountUuidsByOwnerKey.clear();
  },
};
