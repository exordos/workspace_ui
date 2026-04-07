import type { ReactNode } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  size?: AvatarSize;
  /** Avatar image URL. When provided, renders an image; otherwise renders children (e.g. an initial). */
  src?: string | null;
  children: ReactNode;
  className?: string;
}
