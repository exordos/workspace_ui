import { useMessagePresentations } from "~/features/message-presentation/message-presentation.hook";
import { WorkspaceMessageList } from "./workspace-message-list.ui";
import type { WorkspaceMessageListProps } from "./workspace-message-list.types";

// Подключение подготовки для отдельных примеров и тестов с готовым набором сообщений.
export function WorkspaceMessageListWithPreparation(props: WorkspaceMessageListProps) {
  const prepared = useMessagePresentations(props.messages, props.conversationId, true);
  return <WorkspaceMessageList {...props} prepared={prepared} />;
}
