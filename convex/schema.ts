import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_googleId", ["googleId"]),

  folders: defineTable({
    name: v.string(),
    userId: v.id("users"),
    parentId: v.optional(v.id("folders")),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Folder size tracking
    totalSize: v.optional(v.number()), // Total size of all files in this folder and subfolders
    fileCount: v.optional(v.number()), // Total number of files in this folder and subfolders
    lastSizeUpdate: v.optional(v.number()), // Timestamp of last size calculation
  })
    .index("by_user", ["userId"])
    .index("by_parent", ["parentId"])
    .index("by_user_and_parent", ["userId", "parentId"]),

  files: defineTable({
    name: v.string(),
    type: v.string(),
    size: v.number(),
    userId: v.id("users"),
    folderId: v.optional(v.id("folders")),
    createdAt: v.number(),
    updatedAt: v.number(),
    // All files are stored in Telegram - Convex only stores metadata
    telegramStorageId: v.string(), // Telegram file ID
    telegramChunks: v.array(v.object({
      chunkId: v.string(),
      chunkIndex: v.number(),
      messageId: v.number(),
      encryptedHash: v.string(),
      fileId: v.optional(v.string()), // Telegram file_id for downloading
    })),
    totalChunks: v.number(),
    // Optional Convex storage id for video thumbnail
    thumbnailStorageId: v.optional(v.id("_storage")),
  })
    .index("by_user", ["userId"])
    .index("by_folder", ["folderId"])
    .index("by_user_and_folder", ["userId", "folderId"])
    .index("by_telegram_id", ["telegramStorageId"]),
});
