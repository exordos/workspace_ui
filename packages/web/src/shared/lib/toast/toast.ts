/**
 * Imperative in-app toast API (non-OS notifications).
 *
 * Usage:
 *   import { toast } from "~/shared/lib/toast/toast";
 *   toast.error(t("folder.createFailed"));
 */

import { useToastStore } from "./toast.model";

export const toast = {
  error(message: string): string | null {
    return useToastStore.getState().push(message, "error");
  },
  success(message: string): string | null {
    return useToastStore.getState().push(message, "success");
  },
  info(message: string): string | null {
    return useToastStore.getState().push(message, "info");
  },
  dismiss(id: string): void {
    useToastStore.getState().dismiss(id);
  },
};
