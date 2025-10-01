import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Id } from "@/convex/_generated/dataModel";

export type FileItem = {
  _id: Id<'files'>;
  name: string;
  type: string;
  size: number;
  userId: Id<'users'>;
  folderId?: Id<'folders'>;
  createdAt: number;
  updatedAt: number;
  telegramStorageId: string;
  telegramChunks: Array<{
    chunkId: string;
    chunkIndex: number;
    messageId: number;
    encryptedHash: string;
    fileId?: string;
  }>;
  totalChunks: number;
  thumbnailStorageId?: Id<'_storage'>;
};

export type FolderItem = {
  _id: Id<'folders'>;
  name: string;
  userId: Id<'users'>;
  parentId?: Id<'folders'>;
  createdAt: number;
  updatedAt: number;
  totalSize?: number;
  fileCount?: number;
  lastSizeUpdate?: number;
};

// Extended records allow optimistic flags without using any
export type FileRecord = FileItem & { isOptimistic?: boolean };
export type FolderRecord = FolderItem & { isOptimistic?: boolean };

export interface StoreState {
  // data
  files: Record<string, FileRecord>; // by id
  folders: Record<string, FolderRecord>; // by id
  // UI
  currentFolderId?: Id<'folders'>;

  // sync flags
  hydrated: boolean;

  // actions - bulk set from server (legacy, merge-only)
  setFiles: (files: FileItem[]) => void;
  setFolders: (folders: FolderItem[]) => void;

  // actions - scoped replace from server (preferred)
  replaceFilesInFolder: (folderId: Id<'folders'> | undefined, files: FileItem[]) => void;
  replaceFoldersInParent: (parentId: Id<'folders'> | undefined, folders: FolderItem[]) => void;

  // actions - single updates
  upsertFile: (f: FileItem) => void;
  upsertFolder: (f: FolderItem) => void;
  deleteFileLocal: (id: Id<'files'>) => void;
  deleteFolderLocal: (id: Id<'folders'>) => void;

  // UI actions
  setCurrentFolderId: (id?: Id<'folders'>) => void;

  // selectors helpers
  listFoldersIn: (parentId?: Id<'folders'>) => FolderItem[];
  listFilesIn: (folderId?: Id<'folders'>) => FileItem[];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      files: {},
      folders: {},
      currentFolderId: undefined,
      hydrated: false,

      setFiles: (files) => set((state) => {
        const map: Record<string, FileRecord> = { ...state.files };
        for (const f of files) map[String(f._id)] = f;
        return { files: map };
      }),

      setFolders: (folders) => set((state) => {
        const map: Record<string, FolderRecord> = { ...state.folders };
        for (const f of folders) map[String(f._id)] = f;
        return { folders: map };
      }),

      replaceFilesInFolder: (folderId, files) => set((state) => {
        const next: Record<string, FileRecord> = { ...state.files };
        const serverIds = new Set<string>(files.map((f) => String(f._id)));
        // remove files in this folder, but keep optimistic ones not yet returned by server
        for (const [id, f] of Object.entries(state.files)) {
          const belongs = String(f.folderId || '') === String(folderId || '');
          const keepOptimistic = belongs && (f as FileRecord).isOptimistic && !serverIds.has(String(id));
          if (belongs && !keepOptimistic) delete next[id];
        }
        // add/merge fresh list; clear optimistic flag if server returned it
        for (const f of files) {
          const id = String(f._id);
          const prev = next[id] as FileRecord | undefined;
          const merged: FileRecord = { ...(prev || {}), ...f } as FileRecord;
          if (merged.isOptimistic) delete merged.isOptimistic;
          next[id] = merged;
        }
        return { files: next };
      }),

      replaceFoldersInParent: (parentId, folders) => set((state) => {
        const next: Record<string, FolderRecord> = { ...state.folders };
        // remove all folders that belong to parentId first (scope replace)
        for (const [id, f] of Object.entries(state.folders)) {
          const belongs = String(f.parentId || '') === String(parentId || '');
          if (belongs) delete next[id];
        }
        // add fresh list
        for (const f of folders) next[String(f._id)] = f;
        return { folders: next };
      }),

      upsertFile: (f) => set((state) => ({
        files: { ...state.files, [String(f._id)]: f as FileRecord },
      })),

      upsertFolder: (f) => set((state) => ({
        folders: { ...state.folders, [String(f._id)]: f as FolderRecord },
      })),

      deleteFileLocal: (id) => set((state) => {
        const next = { ...state.files };
        delete next[String(id)];
        return { files: next };
      }),

      deleteFolderLocal: (id) => set((state) => {
        const next = { ...state.folders };
        delete next[String(id)];
        return { folders: next };
      }),

      setCurrentFolderId: (id) => set({ currentFolderId: id }),

      listFoldersIn: (parentId) => {
        const state = get();
        return Object.values(state.folders).filter((f) => String(f.parentId || '') === String(parentId || ''));
      },

      listFilesIn: (folderId) => {
        const state = get();
        return Object.values(state.files).filter((f) => String(f.folderId || '') === String(folderId || ''));
      },
    }),
    {
      name: 'cloudvault-state',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      partialize: (state) => ({
        files: state.files,
        folders: state.folders,
        currentFolderId: state.currentFolderId,
      }),
    }
  )
);