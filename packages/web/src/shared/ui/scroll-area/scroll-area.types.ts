import type { HTMLAttributes, ReactNode } from "react";

export interface ScrollAreaProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  as?: "div" | "nav";
  axis?: "x" | "y" | "both";
  scrollbar?: "visible" | "hidden";
  horizontalWheel?: boolean;
}
