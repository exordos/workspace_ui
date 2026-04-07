import React from "react";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";

export interface ExternalAuthMethod {
  name: string;
  display_name: string;
  display_icon?: string;
  login_url: string;
}

export interface LoginPageExternalAuthProps {
  realmBase: string;
  methods: ExternalAuthMethod[];
  onSelectLoginPath: (loginPath: string) => void;
}

export const LoginPageExternalAuth = React.memo<LoginPageExternalAuthProps>(
  function LoginPageExternalAuth({ realmBase, methods, onSelectLoginPath }) {
    if (methods.length === 0) return null;

    return (
      <div className="flex flex-col gap-2">
        {methods.map((method) => {
          const iconUrl =
            method.display_icon != null ? resolveLoginIconUrl(realmBase, method.display_icon) : "";
          return (
            <button
              key={method.name}
              type="button"
              onClick={() => onSelectLoginPath(method.login_url)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-bg"
            >
              {iconUrl.length > 0 && (
                <img src={iconUrl} alt="" className="h-5 w-5 object-contain" />
              )}
              {method.display_name}
            </button>
          );
        })}
      </div>
    );
  },
);
