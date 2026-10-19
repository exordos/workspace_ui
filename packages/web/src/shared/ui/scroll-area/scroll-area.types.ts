import type { HTMLAttributes, ReactNode } from "react";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  as?: "div";
}
