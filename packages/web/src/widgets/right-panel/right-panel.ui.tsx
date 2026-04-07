import React from "react";
import { RightPanelShell } from "./right-panel-shell.ui";
import type { RightPanelProps } from "./right-panel.types";

export type { RightPanelUserInfo } from "./right-panel.types";

export const RightPanel: React.FC<RightPanelProps> = ({ mode = "info", ...props }) => {
  return <RightPanelShell mode={mode} {...props} />;
};
