/**
 * Folder management store — tracks selection, edit mode, and CRUD status.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  createFolder as apiCreateFolder,
  updateFolder as apiUpdateFolder,
  deleteFolder as apiDeleteFolder,
} from "./manage-folders.api";
import type { CreateFolderInput, FolderItem, UpdateFolderInput } from "./manage-folders.types";

export type ManageFolderStatus = "idle" | "saving" | "deleting" | "error";
export type EditMode = "none" | "create" | "edit";

interface ManageFoldersState {
  status: ManageFolderStatus;
  editMode: EditMode;
  selectedFolderId: string | null;
  error: string | null;

  setEditMode: (mode: EditMode) => void;
  selectFolder: (id: string | null) => void;

  create: (input: CreateFolderInput) => Promise<FolderItem | null>;
  update: (folderId: string, input: UpdateFolderInput) => Promise<FolderItem | null>;
  remove: (folderId: string) => Promise<boolean>;

  reset: () => void;
}

const INITIAL_STATE = {
  status: "idle" as ManageFolderStatus,
  editMode: "none" as EditMode,
  selectedFolderId: null as string | null,
  error: null as string | null,
};

export const useManageFoldersStore = create<ManageFoldersState>((set) => ({
  ...INITIAL_STATE,

  setEditMode(mode) {
    logStoreAction("manage-folders", "setEditMode", { mode });
    set({ editMode: mode, error: null });
  },

  selectFolder(id) {
    logStoreAction("manage-folders", "selectFolder", { id });
    set({ selectedFolderId: id });
  },

  async create(input) {
    logStoreAction("manage-folders", "create", { title: input.title });
    set({ status: "saving", error: null });

    const result = await apiCreateFolder(input);
    if (result) {
      set({ status: "idle", editMode: "none" });
    } else {
      set({ status: "error", error: "Failed to create folder" });
    }
    return result;
  },

  async update(folderId, input) {
    logStoreAction("manage-folders", "update", { folderId });
    set({ status: "saving", error: null });

    const result = await apiUpdateFolder(folderId, input);
    if (result) {
      set({ status: "idle", editMode: "none" });
    } else {
      set({ status: "error", error: "Failed to update folder" });
    }
    return result;
  },

  async remove(folderId) {
    logStoreAction("manage-folders", "remove", { folderId });
    set({ status: "deleting", error: null });

    const success = await apiDeleteFolder(folderId);
    if (success) {
      set({ status: "idle", selectedFolderId: null });
    } else {
      set({ status: "error", error: "Failed to delete folder" });
    }
    return success;
  },

  reset() {
    logStoreAction("manage-folders", "reset", {});
    set({ ...INITIAL_STATE });
  },
}));
