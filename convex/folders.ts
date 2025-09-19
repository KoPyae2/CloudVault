import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Calculate folder size recursively
export const calculateFolderSize = query({
  args: {
    folderId: v.id("folders"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      return { totalSize: 0, fileCount: 0 };
    }

    return await calculateFolderSizeRecursive(ctx, args.folderId, args.userId);
  },
});

// Helper function to calculate folder size recursively
async function calculateFolderSizeRecursive(ctx: any, folderId: any, userId: any): Promise<{ totalSize: number; fileCount: number }> {
  let totalSize = 0;
  let fileCount = 0;

  // Get direct files in this folder
  const files = await ctx.db
    .query("files")
    .withIndex("by_user_and_folder", (q: any) =>
      q.eq("userId", userId).eq("folderId", folderId)
    )
    .collect();

  for (const file of files) {
    totalSize += file.size;
    fileCount += 1;
  }

  // Get subfolders and calculate their sizes
  const subfolders = await ctx.db
    .query("folders")
    .withIndex("by_user_and_parent", (q: any) =>
      q.eq("userId", userId).eq("parentId", folderId)
    )
    .collect();

  for (const subfolder of subfolders) {
    const subfolderSize = await calculateFolderSizeRecursive(ctx, subfolder._id, userId);
    totalSize += subfolderSize.totalSize;
    fileCount += subfolderSize.fileCount;
  }

  return { totalSize, fileCount };
}

// Update folder size cache
export const updateFolderSizeCache = mutation({
  args: {
    folderId: v.id("folders"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found or access denied");
    }

    const { totalSize, fileCount } = await calculateFolderSizeRecursive(ctx, args.folderId, args.userId);

    await ctx.db.patch(args.folderId, {
      totalSize,
      fileCount,
      lastSizeUpdate: Date.now(),
    });

    return { totalSize, fileCount };
  },
});

// Create a new folder
export const createFolder = mutation({
  args: {
    name: v.string(),
    userId: v.id("users"),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const folderId = await ctx.db.insert("folders", {
      name: args.name,
      userId: args.userId,
      parentId: args.parentId,
      totalSize: 0,
      fileCount: 0,
      lastSizeUpdate: now,
      createdAt: now,
      updatedAt: now,
    });
    return folderId;
  },
});

// Get folders for a user in a specific parent folder
export const getFolders = query({
  args: {
    userId: v.id("users"),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folders")
      .withIndex("by_user_and_parent", (q) =>
        q.eq("userId", args.userId).eq("parentId", args.parentId)
      )
      .collect();
  },
});

// Get all folders for a user (for move operations)
export const getAllFolders = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Rename a folder
export const renameFolder = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found or access denied");
    }

    await ctx.db.patch(args.folderId, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

// Move a folder
export const moveFolder = mutation({
  args: {
    folderId: v.id("folders"),
    parentId: v.optional(v.id("folders")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found or access denied");
    }

    await ctx.db.patch(args.folderId, {
      parentId: args.parentId,
      updatedAt: Date.now(),
    });
  },
});

// Copy a folder and all its contents
export const copyFolder = mutation({
  args: {
    folderId: v.id("folders"),
    userId: v.id("users"),
    newParentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found or access denied");
    }

    // Create the new folder
    const now = Date.now();
    const newFolderId = await ctx.db.insert("folders", {
      name: `Copy of ${folder.name}`,
      userId: args.userId,
      parentId: args.newParentId,
      createdAt: now,
      updatedAt: now,
    });

    // Recursively copy all subfolders and files
    await copyFolderContents(ctx, args.folderId, newFolderId, args.userId);

    return newFolderId;
  },
});

// Helper function to recursively copy folder contents
async function copyFolderContents(
  ctx: any,
  sourceFolderId: string,
  targetFolderId: string,
  userId: string
) {
  // Copy subfolders
  const subfolders = await ctx.db
    .query("folders")
    .withIndex("by_user_and_parent", (q: any) =>
      q.eq("userId", userId).eq("parentId", sourceFolderId)
    )
    .collect();

  for (const subfolder of subfolders) {
    const now = Date.now();
    const newSubfolderId = await ctx.db.insert("folders", {
      name: subfolder.name,
      userId: userId,
      parentId: targetFolderId,
      createdAt: now,
      updatedAt: now,
    });

    // Recursively copy contents
    await copyFolderContents(ctx, subfolder._id, newSubfolderId, userId);
  }

  // Copy files
  const files = await ctx.db
    .query("files")
    .withIndex("by_user_and_folder", (q: any) =>
      q.eq("userId", userId).eq("folderId", sourceFolderId)
    )
    .collect();

  for (const file of files) {
    const now = Date.now();
    await ctx.db.insert("files", {
      name: file.name,
      type: file.type,
      size: file.size,
      storageId: file.storageId,
      userId: userId,
      folderId: targetFolderId,
      telegramStorageId: file.telegramStorageId,
      telegramChunks: file.telegramChunks,
      totalChunks: file.totalChunks,
      storageType: file.storageType,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// Delete a folder and all its contents
export const deleteFolder = mutation({
  args: {
    folderId: v.id("folders"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== args.userId) {
      throw new Error("Folder not found or access denied");
    }

    // Recursively delete all contents
    await deleteFolderContents(ctx, args.folderId, args.userId);

    // Delete the folder itself
    await ctx.db.delete(args.folderId);
  },
});

// Helper function to recursively delete folder contents
async function deleteFolderContents(
  ctx: any,
  folderId: string,
  userId: string
) {
  // Delete subfolders recursively
  const subfolders = await ctx.db
    .query("folders")
    .withIndex("by_user_and_parent", (q: any) =>
      q.eq("userId", userId).eq("parentId", folderId)
    )
    .collect();

  for (const subfolder of subfolders) {
    await deleteFolderContents(ctx, subfolder._id, userId);
    await ctx.db.delete(subfolder._id);
  }

  // Delete files and their storage
  const files = await ctx.db
    .query("files")
    .withIndex("by_user_and_folder", (q: any) =>
      q.eq("userId", userId).eq("folderId", folderId)
    )
    .collect();

  for (const file of files) {
    // Only delete from Convex storage if it's stored there
    if (file.storageType === "convex" && file.storageId) {
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete(file._id);
  }
}