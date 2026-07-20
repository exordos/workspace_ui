import type { CSSProperties, ReactNode } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  size?: AvatarSize;
  /** Avatar image URL. When provided, renders an image; otherwise renders children (e.g. an initial). */
  src?: string | null;
  /** Native image loading hint. Defaults to `lazy` for list performance; use `eager` for above-the-fold LCP. */
  imageLoading?: "eager" | "lazy";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}
