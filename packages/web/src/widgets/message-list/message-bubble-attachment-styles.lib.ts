/** Tailwind class bundles for file-attachment links inside sanitized message HTML. */

export const MESSAGE_BUBBLE_ATTACHMENT_LINK_BASE_CLASSES = [
  "inline-flex",
  "max-w-[220px]",
  "items-center",
  "gap-2",
  "rounded-md",
  "border",
  "px-2.5",
  "py-1.5",
  "font-medium",
  "no-underline",
  "transition-colors",
] as const;

export const MESSAGE_BUBBLE_ATTACHMENT_LINK_STATUS_CLASSES = {
  idle: ["border-border-subtle", "bg-bg/40", "text-text-primary", "hover:bg-bg/60"],
  downloading: [
    "border-border-subtle",
    "bg-bg/60",
    "text-text-muted",
    "pointer-events-none",
    "animate-pulse",
  ],
  downloaded: ["border-notice-base/50", "bg-notice-base/10", "text-notice-base"],
  error: ["border-border-subtle", "bg-bg/20", "text-text-muted"],
} as const;
