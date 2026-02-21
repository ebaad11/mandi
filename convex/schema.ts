import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  positions: defineTable({
    userId: v.string(),
    x: v.number(),
    y: v.number(),
  }).index("by_userId", ["userId"]),
});
