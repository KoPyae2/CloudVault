import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update user after Google login
export const createOrUpdateUser = mutation({
  args: {
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .unique();

    if (existingUser) {
      // Update existing user (only update basic info, preserve custom fields)
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        name: args.name,
        updatedAt: Date.now(),
      });
      return existingUser._id;
    } else {
      // Create new user with default profile values (no Google photo by default)
      return await ctx.db.insert("users", {
        googleId: args.googleId,
        email: args.email,
        name: args.name,
        createdAt: Date.now(),
      });
    }
  },
});

// Get user by Google ID
export const getUserByGoogleId = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .unique();
  },
});
