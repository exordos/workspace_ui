import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

interface WrapperOptions {
  route?: string;
}

function createWrapper({ route = "/" }: WrapperOptions = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions & WrapperOptions) {
  const { route, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createWrapper({ route }),
    ...renderOptions,
  });
}
