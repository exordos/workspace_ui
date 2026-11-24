import { useUsersStore } from "./user.model";
import type { User, UserLoadStatus, UsersById, UserUuid } from "./user.types";

// Read-only state of the selected user directory for projections and diagnostics.
export interface ActiveUsersSnapshot {
  readonly ownerKey: string | null; // Owner of the selected directory.
  readonly usersById: Readonly<UsersById>; // Profiles indexed by Workspace UUID.
  readonly userIds: readonly UserUuid[]; // Ordered UUIDs of the current directory entries.
  readonly loadStatus: UserLoadStatus; // Current load status of the directory.
  readonly error: string | null; // Last directory load error, if any.
  readonly lastLoadedAt: number | null; // Timestamp of the latest directory load.
  readonly lastRefreshedAt: number | null; // Timestamp of the latest refresh.
}

// Select one profile and optionally require it to belong to the expected owner.
export function useUserById(
  userUuid: UserUuid | null | undefined,
  expectedOwnerKey?: string | null,
): User | undefined {
  return useUsersStore((state) =>
    userUuid != null && (expectedOwnerKey === undefined || state.ownerKey === expectedOwnerKey)
      ? state.usersById[userUuid]
      : undefined,
  );
}

// Subscribe to the selected directory map, with an optional stable empty result.
export function useUsersById(emptyUsersById?: Readonly<UsersById>): Readonly<UsersById> {
  return useUsersStore((state) =>
    emptyUsersById != null && Object.keys(state.usersById).length === 0
      ? emptyUsersById
      : state.usersById,
  );
}

// Subscribe to the UUIDs in the selected directory.
export function useUserIds(): readonly UserUuid[] {
  return useUsersStore((state) => state.userIds);
}

// Subscribe to the selected directory's owner.
export function useUsersOwnerKey(): string | null {
  return useUsersStore((state) => state.ownerKey);
}

// Subscribe to the number of users without subscribing to individual profiles.
export function useUserCount(): number {
  return useUsersStore((state) => state.userIds.length);
}

// Read one profile from the currently selected directory outside React.
export function readActiveUser(
  userUuid: UserUuid,
  expectedOwnerKey?: string | null,
): User | undefined {
  const { ownerKey, usersById } = useUsersStore.getState();
  return expectedOwnerKey === undefined || ownerKey === expectedOwnerKey
    ? usersById[userUuid]
    : undefined;
}

// Read the selected directory's data with its original map and UUID list references.
export function readActiveUsers(): ActiveUsersSnapshot {
  const { ownerKey, usersById, userIds, loadStatus, error, lastLoadedAt, lastRefreshedAt } =
    useUsersStore.getState();
  return { ownerKey, usersById, userIds, loadStatus, error, lastLoadedAt, lastRefreshedAt };
}

// Notify on selected directory updates, flagging changes that switch the owner.
export function subscribeActiveUsers(listener: (ownerChanged: boolean) => void): () => void {
  return useUsersStore.subscribe((state, previous) =>
    listener(state.ownerKey !== previous.ownerKey),
  );
}
