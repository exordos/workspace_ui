export type ToastVariant = "error" | "success" | "info";

export interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}
