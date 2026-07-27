import type { ExternalAccount } from "~/entities/external-account/external-account.types";

const TEMPORARILY_ALLOW_EXTERNAL_CHAT_CATALOG_WITHOUT_CAPABILITY = true;

export function hasExternalChatCatalog(account: ExternalAccount): boolean {
  const capability = account.capabilities["messenger.chat_catalog"];
  if (typeof capability !== "object" || capability === null || Array.isArray(capability)) {
    return false;
  }
  return "available" in capability && capability.available === true;
}

export function canConfigureExternalChats(account: ExternalAccount): boolean {
  // The account snapshot can lag behind the catalog endpoint during bridge rollout.
  if (TEMPORARILY_ALLOW_EXTERNAL_CHAT_CATALOG_WITHOUT_CAPABILITY) return true;
  return hasExternalChatCatalog(account);
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      if (item !== undefined) await task(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker()),
  );
}
