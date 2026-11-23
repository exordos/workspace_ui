import React from "react";
import { getOrganizationLogoSrc } from "~/shared/lib/organization-branding";

export interface LoginPageRealmPreviewProps {
  realmName: string;
  realmIcon: string;
  projectName?: string;
  onLogoError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export const LoginPageRealmPreview = React.memo<LoginPageRealmPreviewProps>(
  function LoginPageRealmPreview({ realmName, realmIcon, projectName, onLogoError }) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-3">
        <img
          data-testid="realm-logo-preview"
          src={getOrganizationLogoSrc(realmIcon)}
          alt=""
          className="h-12 w-12 rounded-lg object-contain"
          onError={onLogoError}
        />
        {realmName.trim().length > 0 && (
          <span className="wrap-anywhere text-center text-sm font-medium text-text-primary">
            {realmName}
          </span>
        )}
        {projectName != null && (
          <span className="wrap-anywhere text-center text-sm text-text-muted">{projectName}</span>
        )}
      </div>
    );
  },
);
