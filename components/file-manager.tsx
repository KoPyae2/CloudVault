"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery } from "convex/react";
import { UploadDialog } from "./upload-dialog";
import { useDownloadManager } from "./download-manager";
import Navbar from "./navbar";
import { Button } from "@/components/ui/button";
import { useStore, type StoreState, type FileItem as StoreFileItem, type FolderItem as StoreFolderItem } from "@/lib/store";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UnifiedPopoverMenuContent } from "@/components/context-menu";
import {
  Folder,
  File,
  Plus,
  // Edit,
  Copy,
  Move,
  Trash2,
  // Download,
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  Archive,
  FolderOpen,
  Upload,
  Grid3X3,
  List,
  MoreVertical,
  X,
  Home,
  ChevronRight,

} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";

type FileItem = StoreFileItem;
type FolderItem = StoreFolderItem;

// File type icon helper (placed before thumbnail to avoid runtime refs)
const getFileIcon = (type: string) => {
  if (type.startsWith("image/"))
    return <ImageIcon className="h-6 w-6 text-blue-500" />;
  if (type.startsWith("text/"))
    return <FileText className="h-6 w-6 text-gray-500" />;
  if (type.startsWith("audio/"))
    return <Music className="h-6 w-6 text-green-500" />;
  if (type.startsWith("video/"))
    return <Video className="h-6 w-6 text-red-500" />;
  if (type.includes("zip") || type.includes("rar"))
    return <Archive className="h-6 w-6 text-yellow-500" />;
  return <File className="h-6 w-6 text-gray-500" />;
};

// Simple in-memory cache to avoid refetching thumbnails during this session
const g = globalThis as typeof globalThis & { __thumbCache?: Map<string, string> };
const thumbnailCache = g.__thumbCache || new Map<string, string>();
g.__thumbCache = thumbnailCache;

// Props interface for MemoFileThumbnail component
interface MemoFileThumbnailProps {
  file: FileItem;
  size?: string;
  userId: string;
}

// Memoized thumbnail component to avoid remounts on list re-renders
const MemoFileThumbnail = React.memo(
  function MemoFileThumbnail({ file, size = "h-12 w-12", userId }: MemoFileThumbnailProps) {
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(false);

    const isImage = file.type.startsWith("image/");
    // const isVideo = file.type.startsWith("video/");

    React.useEffect(() => {
      // Only generate thumbnails for images, not videos
      if (!isImage) return;

      const cacheKey = `thumb:${file.telegramStorageId}`;

      const loadFromCache = () => {
        const mem = thumbnailCache.get(cacheKey);
        if (mem) {
          setThumbnailUrl(mem);
          return true;
        }
        try {
          const stored = localStorage.getItem(cacheKey);
          if (stored) {
            thumbnailCache.set(cacheKey, stored);
            setThumbnailUrl(stored);
            return true;
          }
        } catch {}
        return false;
      };

      if (loadFromCache()) return;

      const generateThumbnail = async () => {
        setIsLoading(true);
        setError(false);
        try {
          const response = await fetch("/api/telegram/thumbnail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId: file.telegramStorageId,
              userId,
              chunks: file.telegramChunks || [],
              fileType: file.type,
            }),
          });
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            setThumbnailUrl(dataUrl);
            thumbnailCache.set(cacheKey, dataUrl);
            try {
              localStorage.setItem(cacheKey, dataUrl);
            } catch {}
          } else {
            setError(true);
          }
        } catch (err) {
          console.error("Error generating thumbnail:", err);
          setError(true);
        } finally {
          setIsLoading(false);
        }
      };

      generateThumbnail();
    }, [file.telegramStorageId, file.type, isImage, file.telegramChunks, userId]);

    // Show loading spinner only for images (since we don't generate thumbnails for videos)
    if (isLoading && isImage) {
      return (
        <div
          className={`${size} bg-gray-100 rounded-lg flex items-center justify-center`}
        >
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    // Show thumbnail only for images (and not in error state)
    if (thumbnailUrl && isImage && !error) {
      return (
        <div
          className={`${size} relative rounded-lg overflow-hidden bg-gray-100`}
        >
          <Image
            src={thumbnailUrl}
            alt={file.name}
            width={100}
            height={200}
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
        </div>
      );
    }

    // For videos, error states, and all other file types, show the appropriate icon
    return (
      <div className={`${size} flex items-center justify-center`}>
        {getFileIcon(file.type)}
      </div>
    );
  },
  (prev, next) =>
    prev.file.telegramStorageId === next.file.telegramStorageId &&
    prev.file.type === next.file.type &&
    prev.size === next.size
);

export function FileManager() {
  const { data: session } = useSession();
  const { addDownload } = useDownloadManager();

  const currentFolderId = useStore((s: StoreState) => s.currentFolderId);
  const setCurrentFolderId = useStore((s: StoreState) => s.setCurrentFolderId);
  const [selectedItem, setSelectedItem] = useState<
    FileItem | FolderItem | null
  >(null);
  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState<FolderItem[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // Floating selection menu open/close
  const [isSelectionMenuOpen, setIsSelectionMenuOpen] = useState(false);
  // Popover menu state for menu buttons
  const [popoverMenuOpen, setPopoverMenuOpen] = useState<string | null>(null);
  // search and sort come from Zustand now
  // search and sort removed
  // All files are uploaded to Telegram storage

  // State for Move dialog tree expansion
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  // Mirror of allFolders to avoid TDZ in memo dependencies
  const [allFoldersState, setAllFoldersState] = useState<
    FolderItem[] | undefined
  >(undefined);

  // Selection helpers and long-press handling
  const filesMap = useStore((s: StoreState) => s.files);
  const foldersMap = useStore((s: StoreState) => s.folders);
  const makeKey = (kind: "file" | "folder", id: string) => `${kind}:${id}`;

  // Keep breadcrumb path (folderPath) in sync with currentFolderId and folders map
  React.useEffect(() => {
    const path: FolderItem[] = [];
    let cursor: string | undefined = currentFolderId ? String(currentFolderId) : undefined;
    const seen = new Set<string>(); // guard against accidental cycles
    while (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const node = foldersMap[cursor];
      if (!node) break;
      path.push(node);
      cursor = node.parentId ? String(node.parentId) : undefined;
    }
    setFolderPath(path.reverse());
  }, [currentFolderId, foldersMap]);
  const toggleSelect = (kind: "file" | "folder", id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const key = makeKey(kind, id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  // Build children map for folder tree
  const childrenMap = React.useMemo(() => {
    const map = new Map<string, FolderItem[]>();
    (allFoldersState || []).forEach((f) => {
      const key = f.parentId ? String(f.parentId) : "root";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    // Sort children by name for stable order
    for (const [, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [allFoldersState]);

  // Set of folder ids that are not valid as move targets (the selected folders themselves and their descendants)
  const invalidTargets = React.useMemo(() => {
    // For batch operations, compute union of all selected folders' subtrees
    const selectedFolders: string[] =
      selectedItem && !("telegramStorageId" in selectedItem)
        ? [String(selectedItem._id)]
        : (Array.from(selectedItems)
            .map((key) =>
              key.startsWith("folder:") ? key.split(":")[1] : null
            )
            .filter(Boolean) as string[]);

    if (!selectedFolders.length) return new Set<string>();

    const blocked = new Set<string>();
    const stack = [...selectedFolders];
    for (const id of selectedFolders) blocked.add(id);

    while (stack.length) {
      const id = stack.pop()!;
      const children = childrenMap.get(id) || [];
      for (const child of children) {
        const cid = String(child._id);
        if (!blocked.has(cid)) {
          blocked.add(cid);
          stack.push(cid);
        }
      }
    }
    return blocked;
  }, [selectedItem, selectedItems, childrenMap]);

  const renderMoveTree = (
    parentKey: string = "root",
    depth = 0,
    action: "move" | "copy" = "move"
  ): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const children = childrenMap.get(parentKey) || [];
    for (const folder of children) {
      const id = String(folder._id);
      const hasChildren = (childrenMap.get(id) || []).length > 0;
      const isExpanded = expandedFolders.has(id);
      const isInvalid = invalidTargets.has(id);

      nodes.push(
        <div key={id} className="w-full">
          <div className="flex items-center">
            {/* Indent */}
            <div style={{ width: depth * 12 }} />
            {hasChildren ? (
              <button
                type="button"
                className="p-1 mr-1 text-gray-600 hover:text-gray-900"
                onClick={() =>
                  setExpandedFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>
            ) : (
              <div className="w-6" />
            )}
            <Button
              variant="outline"
              className="flex-1 justify-start"
              onClick={() =>
                action === "copy"
                  ? handleCopy(folder._id)
                  : handleMove(folder._id)
              }
              disabled={isInvalid}
            >
              <Folder className="h-4 w-4 mr-2" />
              {folder.name}
              {isInvalid && (
                <span className="ml-2 text-xs text-gray-400">
                  (current/child)
                </span>
              )}
            </Button>
          </div>
          {hasChildren && isExpanded && (
            <div className="mt-1">{renderMoveTree(id, depth + 1, action)}</div>
          )}
        </div>
      );
    }
    return nodes;
  };

  // Get the current user from Convex
  const convexUser = useQuery(
    api.users.getUserByGoogleId,
    session?.user?.id ? { googleId: session.user.id } : "skip"
  );

  // Convex queries and mutations
  const folders = useQuery(
    api.folders.getFolders,
    convexUser ? { userId: convexUser._id, parentId: currentFolderId } : "skip"
  );

  const files = useQuery(
    api.files.getFiles,
    convexUser ? { userId: convexUser._id, folderId: currentFolderId } : "skip"
  );

  // Sync convex to Zustand (scoped replace for correct removal/add)
  const replaceFoldersInParentZ = useStore(
    (s: StoreState) => s.replaceFoldersInParent
  );
  const replaceFilesInFolderZ = useStore((s: StoreState) => s.replaceFilesInFolder);
  React.useEffect(() => {
    if (Array.isArray(folders))
      replaceFoldersInParentZ(currentFolderId, folders as FolderItem[]);
  }, [folders, replaceFoldersInParentZ, currentFolderId]);
  React.useEffect(() => {
    if (Array.isArray(files))
      replaceFilesInFolderZ(currentFolderId, files as FileItem[]);
  }, [files, replaceFilesInFolderZ, currentFolderId]);

  const allFolders = useQuery(
    api.folders.getAllFolders,
    convexUser ? { userId: convexUser._id } : "skip"
  );

  // Sync queried allFolders to local state for safe memo use
  React.useEffect(() => {
    if (Array.isArray(allFolders))
      setAllFoldersState(allFolders as FolderItem[]);
    else if (allFolders === undefined) setAllFoldersState(undefined);
  }, [allFolders]);

  // Mutations
  const createFolder = useMutation(api.folders.createFolder);
  const renameFolder = useMutation(api.folders.renameFolder);
  const moveFolder = useMutation(api.folders.moveFolder);
  const copyFolder = useMutation(api.folders.copyFolder);
  const deleteFolder = useMutation(api.folders.deleteFolder);

  const renameFile = useMutation(api.files.renameFile);
  const moveFile = useMutation(api.files.moveFile);
  const copyFile = useMutation(api.files.copyFile);
  const deleteFile = useMutation(api.files.deleteFile);

  // Local store actions
  const upsertFolderZ = useStore((s: StoreState) => s.upsertFolder);
  const upsertFileZ = useStore((s: StoreState) => s.upsertFile);
  const deleteFolderLocalZ = useStore((s: StoreState) => s.deleteFolderLocal);
  const deleteFileLocalZ = useStore((s: StoreState) => s.deleteFileLocal);

  const handleCreateFolder = async () => {
    if (!convexUser || !folderName.trim()) return;

    try {
      await createFolder({
        name: folderName.trim(),
        userId: convexUser._id,
        parentId: currentFolderId,
      });
      setFolderName("");
      setIsCreateFolderOpen(false);
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !newName.trim() || !convexUser) return;

    try {
      if ("telegramStorageId" in selectedItem) {
        // It's a file
        await renameFile({
          fileId: selectedItem._id,
          name: newName.trim(),
          userId: convexUser._id,
        });
        upsertFileZ({
          ...selectedItem,
          name: newName.trim(),
          updatedAt: Date.now(),
        } as FileItem);
      } else {
        // It's a folder
        await renameFolder({
          folderId: selectedItem._id,
          name: newName.trim(),
          userId: convexUser._id,
        });
        upsertFolderZ({
          ...selectedItem,
          name: newName.trim(),
          updatedAt: Date.now(),
        } as FolderItem);
      }
      setIsRenameOpen(false);
      setSelectedItem(null);
      setNewName("");
    } catch (error) {
      console.error("Error renaming:", error);
    }
  };

  const handleMove = async (targetFolderId?: Id<"folders">) => {
    if (!convexUser) return;

    try {
      // Prefer multi-select when available; otherwise fall back to single selectedItem
      const items: Array<FileItem | FolderItem> =
        selectedItems.size > 0
          ? Array.from(selectedItems)
              .map((key) => {
                const [kind, id] = key.split(":");
                const item = (kind === "file"
                  ? (filesMap?.[id] as FileItem | undefined)
                  : (foldersMap?.[id] as FolderItem | undefined));
                return item;
              })
              .filter((i): i is FileItem | FolderItem => Boolean(i))
          : selectedItem
            ? [selectedItem]
            : [];

      for (const item of items) {
        if ("telegramStorageId" in item) {
          await moveFile({
            fileId: item._id,
            folderId: targetFolderId,
            userId: convexUser._id,
          });
          upsertFileZ({
            ...(item as FileItem),
            folderId: targetFolderId ?? undefined,
            updatedAt: Date.now(),
          });
        } else {
          await moveFolder({
            folderId: item._id,
            parentId: targetFolderId,
            userId: convexUser._id,
          });
          upsertFolderZ({
            ...(item as FolderItem),
            parentId: targetFolderId ?? undefined,
            updatedAt: Date.now(),
          });
        }
      }

      setIsMoveOpen(false);
      setSelectedItem(null);
      clearSelection();
    } catch (error) {
      console.error("Error moving:", error);
    }
  };

  const handleCopy = async (targetFolderId?: Id<"folders">) => {
    if (!convexUser) return;

    // If no target provided and the Copy dialog isn't open yet, open it
    if (targetFolderId === undefined && !isCopyOpen) {
      setIsCopyOpen(true);
      return;
    }

    try {
      // Prefer multi-select when available; otherwise fall back to single selectedItem
      const items: Array<FileItem | FolderItem> =
        selectedItems.size > 0
          ? Array.from(selectedItems)
              .map((key) => {
                const [kind, id] = key.split(":");
                const item = (kind === "file"
                  ? (filesMap?.[id] as FileItem | undefined)
                  : (foldersMap?.[id] as FolderItem | undefined));
                return item;
              })
              .filter((i): i is FileItem | FolderItem => Boolean(i))
          : selectedItem
            ? [selectedItem]
            : [];

      for (const item of items) {
        if ("telegramStorageId" in item) {
          const newId = await copyFile({
            fileId: item._id,
            userId: convexUser._id,
            newFolderId: targetFolderId,
          });
          upsertFileZ({
            ...(item as FileItem),
            _id: newId as Id<"files">,
            name: `Copy of ${item.name}`,
            folderId: targetFolderId ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          const newFolderId = await copyFolder({
            folderId: item._id,
            userId: convexUser._id,
            newParentId: targetFolderId,
          });
          upsertFolderZ({
            ...(item as FolderItem),
            _id: newFolderId as Id<"folders">,
            name: `Copy of ${item.name}`,
            parentId: targetFolderId ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }

      setIsCopyOpen(false);
      setSelectedItem(null);
      clearSelection();
    } catch (error) {
      console.error("Error copying:", error);
    }
  };

  const handleDelete = async () => {
    if (!convexUser) return;

    try {
      // Prefer multi-select when available; otherwise fall back to single selectedItem
      const items: Array<FileItem | FolderItem> =
        selectedItems.size > 0
          ? Array.from(selectedItems)
              .map((key) => {
                const [kind, id] = key.split(":");
                const item = (kind === "file"
                  ? (filesMap?.[id] as FileItem | undefined)
                  : (foldersMap?.[id] as FolderItem | undefined));
                return item;
              })
              .filter((i): i is FileItem | FolderItem => Boolean(i))
          : selectedItem
            ? [selectedItem]
            : [];

      for (const item of items) {
        if ("telegramStorageId" in item) {
          await deleteFile({ fileId: item._id, userId: convexUser._id });
          deleteFileLocalZ(item._id);
        } else {
          await deleteFolder({ folderId: item._id, userId: convexUser._id });
          deleteFolderLocalZ(item._id);
        }
      }

      setIsDeleteOpen(false);
      setSelectedItem(null);
      clearSelection();
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  // Simple in-memory cache to avoid refetching thumbnails during this session
  type GlobalWithThumbCache = typeof globalThis & { __thumbCache?: Map<string, string> };
  const g = globalThis as GlobalWithThumbCache;
  const thumbnailCache: Map<string, string> = g.__thumbCache || new Map();
  g.__thumbCache = thumbnailCache;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get all folders and files from store
  const storeFolders = useStore((s: StoreState) => s.folders);
  const storeFiles = useStore((s: StoreState) => s.files);
  
  // Filter them with useMemo to avoid recalculation on every render
  const filteredFolders = React.useMemo(() => 
    Object.values(storeFolders).filter((f) => 
      String(f.parentId || '') === String(currentFolderId || '')
    ), [storeFolders, currentFolderId]
  );
  
  const filteredFiles = React.useMemo(() => 
    Object.values(storeFiles).filter((f) => 
      String(f.folderId || '') === String(currentFolderId || '')
    ), [storeFiles, currentFolderId]
  );

  if (!session?.user || !convexUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading your files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <Navbar session={session} folderPath={folderPath as { _id: string | number; name: string }[]} />

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left group (Back + Select) */}
          <div className="flex items-center gap-2">
            {currentFolderId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Navigate one level up using current folderPath
                  if (folderPath.length === 0) return setCurrentFolderId(undefined);
                  const currentId = String(currentFolderId);
                  const idx = folderPath.findIndex(f => String(f._id) === currentId);
                  const parentCrumb = idx > 0 ? folderPath[idx - 1] : undefined;
                  if (parentCrumb) setCurrentFolderId(parentCrumb._id as Id<'folders'>);
                  else setCurrentFolderId(undefined);
                }}
                className="flex items-center space-x-2 -ml-2"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (selectionMode) clearSelection();
                else setSelectionMode(true);
              }}
            >
              {selectionMode ? "Done" : "Select"}
            </Button>
          </div>

          {/* Right group (New Folder + View) */}
          <div className="flex items-center gap-2">
            <Dialog
              open={isCreateFolderOpen}
              onOpenChange={setIsCreateFolderOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center space-x-2"
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Folder</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Folder</DialogTitle>
                  <DialogDescription>
                    Enter a name for your new folder.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Folder name"
                  onKeyPress={(e) => e.key === "Enter" && handleCreateFolder()}
                />
                <DialogFooter>
                  <Button onClick={handleCreateFolder}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex items-center space-x-1 border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 sm:p-6">
        {(!filteredFolders || filteredFolders.length === 0) &&
        (!filteredFiles || filteredFiles.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <FolderOpen className="h-12 w-12 text-emerald-600" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              No files or folders found
            </h3>
            <p className="text-gray-500 mb-8 max-w-md">
              Get started by creating your first folder or uploading a file.
            </p>
            {
              <div className="flex space-x-4">
                <Button onClick={() => setIsUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
                <Dialog
                  open={isCreateFolderOpen}
                  onOpenChange={setIsCreateFolderOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Folder
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Folder</DialogTitle>
                      <DialogDescription>
                        Enter a name for your new folder.
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="Folder name"
                      onKeyPress={(e) =>
                        e.key === "Enter" && handleCreateFolder()
                      }
                    />
                    <DialogFooter>
                      <Button onClick={handleCreateFolder}>Create</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            }
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
            {filteredFolders.map((folder: FolderItem) => {
              const folderId = String(folder._id);
              return (
                <div key={folder._id} className="relative">
                  <div
                    className="relative file-grid-item flex flex-col items-center p-3 sm:p-4 rounded-lg border bg-white hover:bg-gray-50 cursor-pointer group"
                    onClick={() => {
                      return selectionMode
                        ? toggleSelect("folder", folderId)
                        : setCurrentFolderId(folder._id);
                    }}
                  >
                    {selectionMode && (
                      <input
                        type="checkbox"
                        className="absolute top-2 left-2 h-5 w-5 sm:h-4 sm:w-4"
                        checked={selectedItems.has(
                          makeKey("folder", String(folder._id))
                        )}
                        onChange={() =>
                          toggleSelect("folder", String(folder._id))
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    
                    {/* Menu button in top-right corner - always visible */}
                    <Popover 
                      open={popoverMenuOpen === folderId}
                      onOpenChange={(open) => setPopoverMenuOpen(open ? folderId : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSelection();
                            setSelectedItem(folder);
                          }}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <UnifiedPopoverMenuContent
                          kind="folder"
                          name={folder.name}
                          onRename={() => {
                            setSelectedItem(folder);
                            setIsRenameOpen(true);
                            setNewName(folder.name);
                            setPopoverMenuOpen(null);
                          }}
                          onMove={() => {
                            setSelectedItem(folder);
                            setIsMoveOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onCopy={() => {
                            setSelectedItem(folder);
                            setIsCopyOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onDelete={() => {
                            setSelectedItem(folder);
                            setIsDeleteOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onProperties={() => {
                            setSelectedItem(folder);
                            setIsPropertiesOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <Folder className="h-12 w-12 text-emerald-600 mb-3 group-hover:text-emerald-700" />
                    <span className="text-xs sm:text-sm text-center truncate w-full font-medium">
                      {folder.name}
                    </span>
                    <div className="text-xs text-gray-500 mt-1 text-center">
                      {folder.totalSize !== undefined ? (
                        <div>
                          <div>{formatFileSize(folder.totalSize)}</div>
                          <div>{folder.fileCount || 0} items</div>
                        </div>
                      ) : (
                        <div>{formatDate(folder.createdAt)}</div>
                      )}
                    </div>
                    </div>
                </div>
              );
            })}

            {filteredFiles.map((file: FileItem) => {
              const fileId = String(file._id);
              return (
                <div key={file._id} className="relative">
                  <div
                    className="relative file-grid-item flex flex-col items-center p-3 sm:p-4 rounded-lg border bg-white hover:bg-gray-50 cursor-pointer group"
                    onClick={() => {
                      return selectionMode
                        ? toggleSelect("file", fileId)
                        : undefined;
                    }}
                  >
                    {selectionMode && (
                      <input
                        type="checkbox"
                        className="absolute top-2 left-2 h-5 w-5 sm:h-4 sm:w-4"
                        checked={selectedItems.has(
                          makeKey("file", String(file._id))
                        )}
                        onChange={() => toggleSelect("file", String(file._id))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    
                    {/* Menu button in top-right corner - always visible */}
                    <Popover 
                      open={popoverMenuOpen === fileId}
                      onOpenChange={(open) => setPopoverMenuOpen(open ? fileId : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSelection();
                            setSelectedItem(file);
                          }}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <UnifiedPopoverMenuContent
                          kind="file"
                          name={file.name}
                          onDownload={() => {
                            addDownload(
                              file._id,
                              file.name,
                              file.size,
                              file.type,
                              file.telegramStorageId,
                              file.telegramChunks || []
                            );
                            setPopoverMenuOpen(null);
                          }}
                          onRename={() => {
                            setSelectedItem(file);
                            setIsRenameOpen(true);
                            setNewName(file.name);
                            setPopoverMenuOpen(null);
                          }}
                          onMove={() => {
                            setSelectedItem(file);
                            setIsMoveOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onCopy={() => {
                            setSelectedItem(file);
                            setIsCopyOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onDelete={() => {
                            setSelectedItem(file);
                            setIsDeleteOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onProperties={() => {
                            setSelectedItem(file);
                            setIsPropertiesOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <div className="mb-3 group-hover:scale-110 transition-transform duration-200">
                      <MemoFileThumbnail
                        file={file}
                        size="h-12 w-12"
                        userId={convexUser!._id}
                      />
                    </div>
                    <span className="text-[11px] sm:text-xs text-center truncate w-full font-medium mb-1">
                      {file.name}
                    </span>
                    <div className="flex items-center space-x-1 text-xs text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span className="text-xs">📱</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDate(file.createdAt)}
                    </span>
                    </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-lg border">
            <div className="hidden sm:grid grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 border-b bg-gray-50 text-xs sm:text-sm font-medium text-gray-700">
              <div className="col-span-6">Name</div>
              <div className="col-span-2">Size</div>
              <div className="col-span-3">Modified</div>
              <div className="col-span-1"></div>
            </div>

            {filteredFolders.map((folder: FolderItem) => {
              const folderId = String(folder._id);
              return (
                <div key={folder._id} className="file-list-item grid grid-cols-12 gap-4 p-4 border-b cursor-pointer">
                  <div 
                    className="col-span-11 grid grid-cols-11 gap-4"
                    onClick={() => {
                      return selectionMode
                        ? toggleSelect("folder", folderId)
                        : setCurrentFolderId(folder._id);
                    }}
                  >
                    <div className="col-span-6 flex items-center space-x-3">
                      {selectionMode && (
                        <input
                          type="checkbox"
                          className="h-5 w-5 sm:h-4 sm:w-4"
                          checked={selectedItems.has(
                            makeKey("folder", String(folder._id))
                          )}
                          onChange={() =>
                            toggleSelect("folder", String(folder._id))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <Folder className="h-5 w-5 text-emerald-600" />
                      <span className="font-medium">{folder.name}</span>
                    </div>
                    <div className="col-span-2 text-xs sm:text-sm text-gray-500">
                      {folder.totalSize !== undefined ? (
                        <div>
                          <div>{formatFileSize(folder.totalSize)}</div>
                          <div className="text-xs">
                            {folder.fileCount || 0} items
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </div>
                    <div className="col-span-3 text-xs sm:text-sm text-gray-500">
                      {formatDate(folder.createdAt)}
                    </div>
                  </div>
                  <div className="col-span-1">
                    <Popover
                      open={popoverMenuOpen === folderId}
                      onOpenChange={(open) => setPopoverMenuOpen(open ? folderId : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <UnifiedPopoverMenuContent
                          kind="folder"
                          name={folder.name}
                          onRename={() => {
                            setSelectedItem(folder);
                            setIsRenameOpen(true);
                            setNewName(folder.name);
                            setPopoverMenuOpen(null);
                          }}
                          onMove={() => {
                            setSelectedItem(folder);
                            setIsMoveOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onCopy={() => {
                            setSelectedItem(folder);
                            setIsCopyOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onDelete={() => {
                            setSelectedItem(folder);
                            setIsDeleteOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onProperties={() => {
                            setSelectedItem(folder);
                            setIsPropertiesOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}

            {filteredFiles.map((file: FileItem) => {
              const fileId = String(file._id);
              return (
                <div key={file._id} className="file-list-item grid grid-cols-12 gap-4 p-4 border-b cursor-pointer">
                  <div 
                    className="col-span-11 grid grid-cols-11 gap-4"
                    onClick={() => {
                      return selectionMode
                        ? toggleSelect("file", fileId)
                        : undefined;
                    }}
                  >
                    <div className="col-span-6 flex items-center space-x-3">
                      {selectionMode && (
                        <input
                          type="checkbox"
                          className="h-5 w-5 sm:h-4 sm:w-4"
                          checked={selectedItems.has(
                            makeKey("file", String(file._id))
                          )}
                          onChange={() =>
                            toggleSelect("file", String(file._id))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <MemoFileThumbnail
                        file={file}
                        size="h-8 w-8"
                        userId={convexUser!._id}
                      />
                      <span className="font-medium">{file.name}</span>
                      <span className="text-xs">📱</span>
                    </div>
                    <div className="col-span-2 text-xs sm:text-sm text-gray-500">
                      {formatFileSize(file.size)}
                    </div>
                    <div className="col-span-3 text-xs sm:text-sm text-gray-500">
                      {formatDate(file.createdAt)}
                    </div>
                  </div>
                  <div className="col-span-1">
                    <Popover 
                      open={popoverMenuOpen === fileId} 
                      onOpenChange={(open) => setPopoverMenuOpen(open ? fileId : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSelection();
                            setSelectedItem(file);
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <UnifiedPopoverMenuContent
                          kind="file"
                          name={file.name}
                          onRename={() => {
                            setSelectedItem(file);
                            setIsRenameOpen(true);
                            setNewName(file.name);
                            setPopoverMenuOpen(null);
                          }}
                          onMove={() => {
                            setSelectedItem(file);
                            setIsMoveOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onCopy={() => {
                            setSelectedItem(file);
                            setIsCopyOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onDelete={() => {
                            setSelectedItem(file);
                            setIsDeleteOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onProperties={() => {
                            setSelectedItem(file);
                            setIsPropertiesOpen(true);
                            setPopoverMenuOpen(null);
                          }}
                          onDownload={() => {
                            if ("telegramStorageId" in file) {
                              addDownload(
                                file._id,
                                file.name,
                                file.size,
                                file.type,
                                file.telegramStorageId,
                                file.telegramChunks || []
                              );
                            }
                            setPopoverMenuOpen(null);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Selection Menu (toggleable) */}
      {selectionMode && selectedItems.size > 0 && (
        <div className="fixed bottom-24 right-6 sm:bottom-28 sm:right-8 z-40 flex flex-col items-end space-y-2">
          {isSelectionMenuOpen && (
            <div className="rounded-2xl shadow-lg border bg-white p-2 flex flex-col items-center space-y-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  const hasAny = selectedItems.size > 0 || !!selectedItem;
                  if (!hasAny) return;
                  setIsMoveOpen(true);
                }}
                aria-label="Move"
              >
                <Move className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  const hasAny = selectedItems.size > 0 || !!selectedItem;
                  if (!hasAny) return;
                  setIsCopyOpen(true);
                }}
                aria-label="Copy"
              >
                <Copy className="h-5 w-5" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  const hasAny = selectedItems.size > 0 || !!selectedItem;
                  if (!hasAny) return;
                  setIsDeleteOpen(true);
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          )}
          {/* Toggle button: X when open, menu-circle when closed (match Upload FAB color) */}
          <Button
            variant="default"
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center"
            onClick={() => setIsSelectionMenuOpen(v => !v)}
            aria-label={isSelectionMenuOpen ? "Close selection menu" : "Open selection menu"}
          >
            {isSelectionMenuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <MoreVertical className="h-6 w-6 text-white" />
            )}
          </Button>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rename{" "}
              {selectedItem && "telegramStorageId" in selectedItem
                ? "File"
                : "Folder"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedItems.size > 1 ||
              (!selectedItem && selectedItems.size > 0)
                ? `Move ${selectedItems.size} items`
                : `Move ${selectedItem && "telegramStorageId" in selectedItem ? "File" : "Folder"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {/* Root item */}
            <div className="flex items-center">
              <div className="w-6" />
              <Button
                variant="outline"
                className="flex-1 justify-start"
                onClick={() => handleMove(undefined)}
              >
                <Home className="h-4 w-4 mr-2" />
                Root Directory
              </Button>
            </div>
            {/* Tree */}
            <div className="mt-1 space-y-1">
              {renderMoveTree("root", 0, "move")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Dialog */}
      <Dialog open={isCopyOpen} onOpenChange={setIsCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedItems.size > 1 ||
              (!selectedItem && selectedItems.size > 0)
                ? `Copy ${selectedItems.size} items`
                : `Copy ${selectedItem && "telegramStorageId" in selectedItem ? "File" : "Folder"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {/* Root item */}
            <div className="flex items-center">
              <div className="w-6" />
              <Button
                variant="outline"
                className="flex-1 justify-start"
                onClick={() => handleCopy(undefined)}
              >
                <Home className="h-4 w-4 mr-2" />
                Root Directory
              </Button>
            </div>
            {/* Tree */}
            <div className="mt-1 space-y-1">
              {renderMoveTree("root", 0, "copy")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCopyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleCopy(currentFolderId)}>
              Copy Here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedItems.size > 1 ||
              (!selectedItem && selectedItems.size > 0)
                ? `Delete ${selectedItems.size} items`
                : `Delete ${selectedItem && "telegramStorageId" in selectedItem ? "File" : "Folder"}`}
            </DialogTitle>
            <DialogDescription>
              {selectedItems.size > 1 ||
              (!selectedItem && selectedItems.size > 0)
                ? `Are you sure you want to delete ${selectedItems.size} items? This action cannot be undone.`
                : `Are you sure you want to delete "${selectedItem?.name ?? ""}"? This action cannot be undone.`}
              {selectedItem &&
                !("telegramStorageId" in selectedItem) &&
                " All contents of this folder will also be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Properties Dialog */}
      <Dialog open={isPropertiesOpen} onOpenChange={setIsPropertiesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Properties</DialogTitle>
            <DialogDescription>
              {selectedItem
                ? "telegramStorageId" in selectedItem
                  ? "File details"
                  : "Folder details"
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Name */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{selectedItem?.name ?? "—"}</span>
            </div>
            {/* Type / Items */}
            {selectedItem && "telegramStorageId" in selectedItem ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium">
                    {selectedItem.type || "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Size</span>
                  <span className="font-medium">
                    {formatFileSize(selectedItem.size || 0)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Items</span>
                  <span className="font-medium">
                    {(!selectedItem || "telegramStorageId" in selectedItem) ? 0 : selectedItem.fileCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total size</span>
                  <span className="font-medium">
                    {formatFileSize(selectedItem && !("telegramStorageId" in selectedItem) ? (selectedItem.totalSize ?? 0) : 0)}
                  </span>
                </div>
              </>
            )}
            {/* Created / Updated */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Created</span>
              <span className="font-medium">
                {selectedItem ? formatDate(selectedItem.createdAt) : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Updated</span>
              <span className="font-medium">
                {selectedItem ? formatDate(selectedItem.updatedAt) : "—"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPropertiesOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <UploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        currentFolderId={currentFolderId}
      />

      {/* Floating Upload Button (circular, icon-only) */}
      <div className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40">
        <Button
          variant="default"
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center"
          onClick={() => setIsUploadOpen(true)}
          aria-label="Upload"
        >
          <Upload className="h-6 w-6 text-white" />
        </Button>
      </div>
    </div>
  );
}
