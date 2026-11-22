import { useLocation, useNavigate } from "react-router-dom";
import { WorkspaceLoginForm } from "~/features/workspace-login/workspace-login-form.ui";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { parseWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";
import {
  resolveWorkspaceLoginRedirect,
  sanitizeInternalRedirectTarget,
} from "./login-redirect.lib";

export function LoginPage() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const directRoute = parseWorkspaceMessengerRoute(pathname);
  const directProfile = pathname === "/" && parseWorkspaceProfileShareHash(hash) != null;
  let redirectTarget = sanitizeInternalRedirectTarget(
    new URLSearchParams(search).get("redirectTo"),
  );
  if (directRoute?.kind === "message") {
    redirectTarget = sanitizeInternalRedirectTarget(`${pathname}${search}${hash}`);
  } else if (directProfile) {
    redirectTarget = `/${hash}`;
  }
  const target =
    directRoute?.kind === "message"
      ? directRoute
      : parseWorkspaceMessengerRoute(redirectTarget?.split(/[?#]/, 1)[0] ?? "");
  const messageTarget = target?.kind === "message" ? target : null;
  const profileShare =
    redirectTarget?.startsWith("/#") === true &&
    parseWorkspaceProfileShareHash(redirectTarget.slice(1)) != null;
  return (
    <WorkspaceLoginForm
      messageTarget={messageTarget}
      profileShare={profileShare}
      onBackToWorkspace={() => void navigate("/", { replace: true })}
      onSuccess={(session) => {
        const nextRoute = resolveWorkspaceLoginRedirect({
          redirectTarget,
          organizationId: session.organizationId,
          projectId: session.projectId,
        });
        void navigate(nextRoute, { replace: true });
      }}
    />
  );
}
