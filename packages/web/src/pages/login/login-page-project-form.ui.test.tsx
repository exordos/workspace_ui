import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LoginPageProjectForm } from "./login-page-project-form.ui";
import type { SyntheticEvent } from "react";

describe("LoginPageProjectForm", () => {
  it("selects a project by UUID without submitting the login form", () => {
    const onProjectChange = vi.fn();
    const onSubmit = vi.fn((event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    function ProjectForm() {
      const [projectId, setProjectId] = useState("");
      return (
        <LoginPageProjectForm
          projects={[
            { id: "project-a", name: "Support", organizationName: "Example" },
            { id: "project-b", name: "Product", organizationName: "Example" },
          ]}
          projectId={projectId}
          loading={false}
          error={null}
          onProjectChange={(value) => {
            setProjectId(value);
            onProjectChange(value);
          }}
          onSubmit={onSubmit}
        />
      );
    }

    render(<ProjectForm />);
    expect(screen.getByRole("button", { name: "Login" })).toBeDisabled();
    fireEvent.click(screen.getByRole("combobox", { name: "Project" }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "Product — Example" }),
    );

    expect(onProjectChange).toHaveBeenCalledWith("project-b");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent(
      "Product — Example",
    );
    expect(screen.getByRole("button", { name: "Login" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
