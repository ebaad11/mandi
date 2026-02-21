import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getPosition = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const position = await ctx.db
      .query("positions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!position) {
      return { x: 0, y: 0 };
    }

    return { x: position.x, y: position.y };
  },
});

export const setPosition = mutation({
  args: { userId: v.string(), x: v.number(), y: v.number() },
  handler: async (ctx, { userId, x, y }) => {
    const existing = await ctx.db
      .query("positions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { x, y });
    } else {
      await ctx.db.insert("positions", { userId, x, y });
    }

    return { x, y };
  },
});
