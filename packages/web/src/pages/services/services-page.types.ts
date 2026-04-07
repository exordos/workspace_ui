import type { IconName } from "~/shared/ui/icon";

export interface PlannedServiceCard {
  id: string;
  icon: IconName;
  titleKey: string;
  descriptionKey: string;
}

export interface ServiceStubCardProps {
  card: PlannedServiceCard;
}
