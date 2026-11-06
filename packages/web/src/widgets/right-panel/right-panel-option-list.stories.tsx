import { useState } from "react";
import { t } from "~/i18n/i18n";
import { RightPanelOptionButton, RightPanelOptionList } from "./right-panel-option-list.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function OptionListExample({ withSubtitle = false }: Readonly<{ withSubtitle?: boolean }>) {
  const [selected, setSelected] = useState("general");
  return (
    <div className="w-72 max-w-full">
      <RightPanelOptionList variant="spaced">
        <li>
          <RightPanelOptionButton
            label={t("settings.chatClickActionGeneral")}
            active={selected === "general"}
            onClick={() => setSelected("general")}
          />
        </li>
        <li>
          <RightPanelOptionButton
            label={t("settings.chatClickActionLatestTopic")}
            subtitle={withSubtitle ? t("settings.chatClickActionAvatarHint") : undefined}
            active={selected === "latestTopic"}
            onClick={() => setSelected("latestTopic")}
          />
        </li>
      </RightPanelOptionList>
    </div>
  );
}

const meta = {
  title: "Widgets/RightPanel/OptionList",
  component: OptionListExample,
} satisfies Meta<typeof OptionListExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSubtitle: Story = { args: { withSubtitle: true } };
