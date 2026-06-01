/**
 * Generic optimistic update: apply locally, await server, reconcile or rollback.
 */
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("optimistic-mutation");

export interface OptimisticMutationOptions<T> {
  apply: () => void;
  request: () => Promise<T>;
  reconcile: (result: T) => void;
  rollback: () => void;
  /** When true, rollback on falsy result (default: only on throw). */
  rollbackOnFalsy?: boolean;
  label?: string;
}

export async function optimisticMutation<T>({
  apply,
  request,
  reconcile,
  rollback,
  rollbackOnFalsy = false,
  label = "mutation",
}: OptimisticMutationOptions<T>): Promise<T | null> {
  apply();
  try {
    const result = await request();
    if (rollbackOnFalsy && (result == null || result === false)) {
      rollback();
      return null;
    }
    reconcile(result);
    return result;
  } catch (error) {
    log.warn("optimistic rollback", { label, error });
    rollback();
    return null;
  }
}
