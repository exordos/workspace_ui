import { isValidRealmUrl } from "~/shared/lib/validation";

export interface InitialLoginOrganization {
  organizationUrl: string;
  autoAdvance: boolean;
}

export function resolveInitialLoginOrganization(input: {
  realmPrefill: string | null;
  browserOrigin: string | null;
  defaultOrganizationUrl: string;
}): InitialLoginOrganization {
  const prefilledOrganization = input.realmPrefill?.trim() ?? "";
  if (prefilledOrganization.length > 0) {
    return {
      organizationUrl: prefilledOrganization,
      autoAdvance: input.browserOrigin != null && isValidRealmUrl(prefilledOrganization),
    };
  }

  const defaultOrganization = input.defaultOrganizationUrl.trim();
  if (
    input.browserOrigin != null &&
    defaultOrganization.length > 0 &&
    isValidRealmUrl(defaultOrganization)
  ) {
    return { organizationUrl: defaultOrganization, autoAdvance: true };
  }

  const browserOrigin = input.browserOrigin?.trim() ?? "";
  if (browserOrigin.length > 0 && isValidRealmUrl(browserOrigin)) {
    return { organizationUrl: browserOrigin, autoAdvance: true };
  }

  return { organizationUrl: "", autoAdvance: false };
}
