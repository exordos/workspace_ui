import { forwardRef } from "react";
import "./compact-text-field.css";
import type { ComponentPropsWithoutRef } from "react";

/** A compact text surface. The caller supplies the input's accessible label. */
export function CompactTextField({
  className = "",
  ...props
}: Readonly<ComponentPropsWithoutRef<"div">>) {
  return (
    <div
      {...props}
      className={`focus-within:ring-accent/60 flex h-8 min-w-0 items-center gap-2 rounded-lg bg-compact-field-bg px-2 focus-within:ring-2 ${className}`.trim()}
    />
  );
}

export const CompactTextFieldInput = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(function CompactTextFieldInput({ className = "", ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`compact-text-field-input h-full min-w-0 flex-1 bg-transparent leading-4 text-text-primary outline-none md:!text-xs ${className}`.trim()}
    />
  );
});
