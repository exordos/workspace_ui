import React from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";

interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  as?: "div";
}

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
