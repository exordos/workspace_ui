import { buildOrgRouteIdFromOrigin } from "~/shared/lib/org-route";
import { isValidRealmUrl } from "~/shared/lib/validation";

export interface InitialLoginOrganization {
  organizationUrl: string;
  autoAdvance: boolean;
}

export function resolveInitialLoginOrganization(input: {
  browserOrigin: string | null;
  defaultOrganizationUrl: string;
  messageOrgId?: string;
  sessionOrigins?: readonly string[];
  profileShare?: boolean;
}): InitialLoginOrganization {
  const browser = input.browserOrigin;
  const configured = input.defaultOrganizationUrl.trim();
  // A local Vite origin is a frontend, not an implicit organization backend.
  const browserBackend =
    browser &&
    isValidRealmUrl(browser) &&
    (input.profileShare || new URL(browser).protocol === "https:")
      ? browser
      : "";
  let organizationUrl = "";
  if (input.messageOrgId !== undefined) {
    // A route ID can match multiple origins (e.g. a port and a hyphenated hostname).
    const origins = new Set(
      [...(input.sessionOrigins ?? []), configured, browserBackend]
        .filter(isValidRealmUrl)
        .map((value) => new URL(value).origin)
        .filter((origin) => buildOrgRouteIdFromOrigin(origin) === input.messageOrgId),
    );
    if (origins.size === 1) organizationUrl = [...origins][0] ?? "";
  } else if (browser != null) {
    organizationUrl =
      !input.profileShare && isValidRealmUrl(configured)
        ? new URL(configured).origin
        : browserBackend;
  }

  return { organizationUrl, autoAdvance: organizationUrl.length > 0 };
}
