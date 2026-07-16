import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { env } from "~/shared/lib/env";
import { withOrgRoutePrefix } from "~/shared/lib/org-route";

export interface MessengerOnlyRouteProps {
  children: React.ReactNode;
  messengerOnly?: boolean;
}

/** Keeps non-Messenger pages in the bundle while gating them for Messenger-only builds. */
export const MessengerOnlyRoute: React.FC<MessengerOnlyRouteProps> = ({
  children,
  messengerOnly = env.MESSENGER_ONLY,
}) => {
  const { orgId } = useParams<{ orgId?: string }>();

  if (!messengerOnly) return <>{children}</>;
  return <Navigate to={orgId ? withOrgRoutePrefix("/inbox", orgId) : "/inbox"} replace />;
};
