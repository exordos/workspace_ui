import React from "react";

export interface SkeletonProps {
  className?: string;
}

const BASE_CLASS = "animate-pulse rounded bg-border-subtle/60";

export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div className={`${BASE_CLASS} ${className}`.trim()} aria-hidden />
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
