export type { UserProfileData, OwnStatusData } from "./user-profile.types";

export { useUserProfileStore, type UserProfileStatus } from "./user-profile.model";

export {
  fetchUserProfile,
  fetchOwnStatus,
  updateOwnProfile,
  updateOwnStatus,
} from "./user-profile.api";
