import type { CSSProperties, ReactNode } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  size?: AvatarSize;
  /** Avatar image URL. When provided, renders an image; otherwise renders children (e.g. an initial). */
  src?: string | null;
  /** Native image loading hint. Defaults to `lazy` for list performance; use `eager` for above-the-fold LCP. */
  imageLoading?: "eager" | "lazy";
  /**
   * Кликабельный аватар (профиль и т.п.): hover-кольцо через родителя `group`
   * и курсор pointer. Выкл. по умолчанию — декоративные аватары без клика.
   */
  interactive?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}
