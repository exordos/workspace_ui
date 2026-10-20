import React from "react";

export interface SkeletonProps {
  className?: string;
  animated?: boolean;
}

const BASE_CLASS = "rounded bg-border-subtle/60";

export const Skeleton: React.FC<SkeletonProps> = ({ className = "", animated = true }) => (
  <div
    className={`${BASE_CLASS} ${animated ? "animate-pulse" : ""} ${className}`.trim()}
    aria-hidden
  />
);

export interface SkeletonTextProps {
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({ className = "h-4 w-3/4" }) => (
  <Skeleton className={className} />
);

export interface SkeletonRectProps {
  className?: string;
}

export const SkeletonRect: React.FC<SkeletonRectProps> = ({ className = "h-20 w-full" }) => (
  <Skeleton className={className} />
);
