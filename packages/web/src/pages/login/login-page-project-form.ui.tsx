import React from "react";
import type { WorkspaceAuthProject } from "~/entities/workspace-auth/workspace-auth.lib";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field.ui";

interface LoginPageProjectFormProps {
  projects: readonly WorkspaceAuthProject[];
  projectId: string;
  loading: boolean;
  error: string | null;
  onProjectChange: (projectId: string) => void;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const LoginPageProjectForm = React.memo<LoginPageProjectFormProps>(
  function LoginPageProjectForm({
    projects,
    projectId,
    loading,
    error,
    onProjectChange,
    onSubmit,
  }) {
    if (projects.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {t("auth.noProjectsAvailable")}
          </div>
          {error != null && error.length > 0 && (
            <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
              {error}
            </div>
          )}
        </div>
      );
    }

    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.selectProject")} htmlFor="projectId">
          <select
            id="projectId"
            value={projectId}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={loading}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-text-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="" disabled>
              {t("auth.selectProjectPlaceholder")}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.organizationName != null ? ` — ${project.organizationName}` : ""}
              </option>
            ))}
          </select>
        </FormField>

        {error != null && error.length > 0 && (
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading || projectId.length === 0} className="w-full">
          {loading ? t("auth.loginLoading") : t("auth.login")}
        </Button>
      </form>
    );
  },
);
