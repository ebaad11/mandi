import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

export const createEvent = internalMutation({
  args: {
    tickNumber: v.number(),
    type: v.string(),
    actorId: v.string(),
    targetId: v.union(v.string(), v.null()),
    q: v.number(),
    r: v.number(),
    outcome: v.string(),
    narrative: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const getRecentEventsForPlayer = query({
  args: { playerId: v.string(), limit: v.number() },
  handler: async (ctx, { playerId, limit }) => {
    const asActor = await ctx.db
      .query("events")
      .withIndex("by_actorId", (q) => q.eq("actorId", playerId))
      .order("desc")
      .take(limit);

    // Also get events where player is the target
    const allEvents = await ctx.db.query("events").order("desc").take(limit * 2);
    const asTarget = allEvents.filter(
      (e) => e.targetId === playerId && e.actorId !== playerId
    );

    // Merge and deduplicate
    const merged = [...asActor, ...asTarget];
    const seen = new Set<string>();
    const unique = merged.filter((e) => {
      if (seen.has(e._id)) return false;
      seen.add(e._id);
      return true;
    });

    return unique
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  },
});

export const getRecentEvents = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("events")
      .order("desc")
      .take(limit);
  },
});
