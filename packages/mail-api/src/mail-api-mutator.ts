/**
 * Injectable HTTP layer for Orval-generated Mail API calls.
 *
 * The web app registers `setMailApiMutator` with Bearer auth and base URL.
 */

export type MailMutatorInit = RequestInit;

export type MailMutatorFn = <T>(url: string, init: MailMutatorInit) => Promise<T>;

let impl: MailMutatorFn | null = null;

/** Called once at app bootstrap before any Mail API usage. */
export function setMailApiMutator(next: MailMutatorFn): void {
  impl = next;
}

/**
 * Orval custom instance — must match the name in `orval.config.ts` (`customInstance`).
 */
export async function customInstance<T>(url: string, init: MailMutatorInit): Promise<T> {
  if (!impl) {
    throw new Error("Mail API mutator not configured: call setMailApiMutator() during app init");
  }
  return impl<T>(url, init);
}
