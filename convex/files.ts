import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";

// Helper function to update folder sizes recursively
async function updateFolderSizes(ctx: any, folderId: any, sizeChange: number, fileCountChange: number) {
  const folder = await ctx.db.get(folderId);
  if (!folder) return;

  const currentSize = folder.totalSize || 0;
  const currentFileCount = folder.fileCount || 0;

  await ctx.db.patch(folderId, {
    totalSize: currentSize + sizeChange,
    fileCount: currentFileCount + fileCountChange,
    lastSizeUpdate: Date.now(),
  });

  // Recursively update parent folders
  if (folder.parentId) {
    await updateFolderSizes(ctx, folder.parentId, sizeChange, fileCountChange);
  }
}

// Create a new file (all files stored in Telegram)
export const createFile = mutation({
  args: {
    name: v.string(),
    type: v.string(),
    size: v.number(),
    userId: v.id("users"),
    folderId: v.optional(v.id("folders")),
    telegramStorageId: v.string(),
    telegramChunks: v.array(v.object({
      chunkId: v.string(),
      chunkIndex: v.number(),
      messageId: v.number(),
      encryptedHash: v.string(),
      fileId: v.optional(v.string()),
    })),
    totalChunks: v.number(),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fileId = await ctx.db.insert("files", {
      name: args.name,
      type: args.type,
      size: args.size,
      userId: args.userId,
      folderId: args.folderId,
      telegramStorageId: args.telegramStorageId,
      telegramChunks: args.telegramChunks,
      totalChunks: args.totalChunks,
      thumbnailStorageId: args.thumbnailStorageId,
      createdAt: now,
      updatedAt: now,
    });

    // Update folder sizes if file is in a folder
    if (args.folderId) {
      await updateFolderSizes(ctx, args.folderId, args.size, 1);
    }

    return fileId;
  },
});

// Get files for a user in a specific folder
export const getFiles = query({
  args: {
    userId: v.id("users"),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_user_and_folder", (q) =>
        q.eq("userId", args.userId).eq("folderId", args.folderId)
      )
      .collect();
  },
});

// Note: File downloads are handled directly through Telegram API
// No need for getFileUrl since all files are in Telegram

// Rename a file
export const renameFile = mutation({
  args: {
    fileId: v.id("files"),
    name: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      throw new Error("File not found or access denied");
    }

    await ctx.db.patch(args.fileId, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

// Move a file
export const moveFile = mutation({
  args: {
    fileId: v.id("files"),
    folderId: v.optional(v.id("folders")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      throw new Error("File not found or access denied");
    }

    const oldFolderId = file.folderId;

    await ctx.db.patch(args.fileId, {
      folderId: args.folderId,
      updatedAt: Date.now(),
    });

    // Update folder sizes
    if (oldFolderId) {
      await updateFolderSizes(ctx, oldFolderId, -file.size, -1);
    }
    if (args.folderId) {
      await updateFolderSizes(ctx, args.folderId, file.size, 1);
    }
  },
});

// Copy a file
export const copyFile = mutation({
  args: {
    fileId: v.id("files"),
    userId: v.id("users"),
    newFolderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      throw new Error("File not found or access denied");
    }

    const now = Date.now();
    const newFileId = await ctx.db.insert("files", {
      name: `Copy of ${file.name}`,
      type: file.type,
      size: file.size,
      userId: args.userId,
      folderId: args.newFolderId,
      telegramStorageId: file.telegramStorageId,
      telegramChunks: file.telegramChunks,
      totalChunks: file.totalChunks,
      createdAt: now,
      updatedAt: now,
    });

    // Update folder sizes if file is copied to a folder
    if (args.newFolderId) {
      await updateFolderSizes(ctx, args.newFolderId, file.size, 1);
    }

    return newFileId;
  },
});

// Set or update a file's thumbnail
export const setFileThumbnail = mutation({
  args: {
    fileId: v.id("files"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      thumbnailStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});

// Delete a file
export const deleteFile = mutation({
  args: {
    fileId: v.id("files"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      throw new Error("File not found or access denied");
    }

    // If video thumbnail exists in Convex storage, delete it too
    if (file.thumbnailStorageId) {
      try {
        await ctx.storage.delete(file.thumbnailStorageId);
      } catch (e) {
        console.warn('Failed to delete thumbnail from storage', e);
      }
    }

    // Note: We don't delete files from Telegram automatically
    // as they might be used for backup purposes or shared across users

    // Update folder sizes if file was in a folder
    if (file.folderId) {
      await updateFolderSizes(ctx, file.folderId, -file.size, -1);
    }

    // Delete from database
    await ctx.db.delete(args.fileId);
  },
});

// All files are now created using the main createFile function

// Get file info (all files are already in Telegram)
export const getFileInfo = query({
  args: {
    fileId: v.id("files"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      throw new Error("File not found or access denied");
    }

    return {
      success: true,
      message: `File "${file.name}" is stored in Telegram`,
      telegramStorageId: file.telegramStorageId,
      chunks: file.telegramChunks,
      totalChunks: file.totalChunks,
    };
  },
});

// Helper query to get file by ID
export const getFileById = query({
  args: {
    fileId: v.id("files"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== args.userId) {
      return null;
    }
    return file;
  },
});