import React from "react";
import { MailView } from "~/widgets/mail-view/mail-view.ui";
import { useMailPageBootstrap } from "./mail-page.hook";

export const MailPage: React.FC = () => {
  useMailPageBootstrap();
  return <MailView />;
};
