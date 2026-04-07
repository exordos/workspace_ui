import React from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import type { ScrollAreaProps } from "./scroll-area.types";

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  children,
  className = "",
  as: Tag = "div",
}) => {
  return (
    <Tag className={`min-h-0 overflow-y-auto ${SCROLL_AREA_CLASS} ${className}`.trim()}>
      {children}
    </Tag>
  );
};
