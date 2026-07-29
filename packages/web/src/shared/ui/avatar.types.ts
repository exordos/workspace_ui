import type { CSSProperties, ReactNode } from "react";

/** xs=36, sm=32, md=40, lg=48, xl=64 (profile header / Figma profile block). */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

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
