import type { ToastEntry } from "~/shared/lib/toast/toast.types";

export interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}
