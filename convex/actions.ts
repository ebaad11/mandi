import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

export const queueAction = mutation({
  args: {
    playerId: v.string(),
    unitId: v.union(v.id("units"), v.null()),
    type: v.string(),
    targetQ: v.number(),
    targetR: v.number(),
    apCost: v.number(),
    targetPlayerId: v.union(v.string(), v.null()),
    diplomacyType: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pendingActions", {
      playerId: args.playerId,
      unitId: args.unitId,
      type: args.type,
      targetQ: args.targetQ,
      targetR: args.targetR,
      submittedAt: Date.now(),
      status: "queued",
      apCost: args.apCost,
      targetPlayerId: args.targetPlayerId,
      diplomacyType: args.diplomacyType,
    });
  },
});

export const getQueuedActions = query({
  args: { playerId: v.string() },
  handler: async (ctx, { playerId }) => {
    return await ctx.db
      .query("pendingActions")
      .withIndex("by_playerId_status", (q) =>
        q.eq("playerId", playerId).eq("status", "queued")
      )
      .collect();
  },
});

export const cancelAction = mutation({
  args: { actionId: v.id("pendingActions"), playerId: v.string() },
  handler: async (ctx, { actionId, playerId }) => {
    const action = await ctx.db.get(actionId);
    if (!action || action.playerId !== playerId || action.status !== "queued") {
      return { success: false, error: "Action not found or already resolved" };
    }

    await ctx.db.patch(actionId, { status: "cancelled" });

    // Refund AP
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", playerId))
      .first();
    if (player) {
      await ctx.db.patch(player._id, {
        actionPoints: Math.min(
          player.maxActionPoints,
          player.actionPoints + action.apCost
        ),
      });
    }

    return { success: true };
  },
});

// Internal query for tick resolver - sorted: defend first, move, attack last
const ACTION_ORDER = ["defend", "found", "move", "scout", "invest", "attack", "diplomacy"];

export const getActionsForTick = internalQuery({
  args: {},
  handler: async (ctx) => {
    const actions = await ctx.db
      .query("pendingActions")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();

    return actions.sort(
      (a, b) =>
        (ACTION_ORDER.indexOf(a.type) ?? 99) -
        (ACTION_ORDER.indexOf(b.type) ?? 99)
    );
  },
});

export const internalCancelAllActions = internalMutation({
  args: { playerId: v.string() },
  handler: async (ctx, { playerId }) => {
    const actions = await ctx.db
      .query("pendingActions")
      .withIndex("by_playerId_status", (q) =>
        q.eq("playerId", playerId).eq("status", "queued")
      )
      .collect();
    for (const action of actions) {
      await ctx.db.patch(action._id, { status: "cancelled" });
    }
  },
});

export const internalMarkResolved = internalQuery({
  args: { actionId: v.id("pendingActions") },
  handler: async (ctx, { actionId }) => {
    // This is intentionally a query stub - resolution happens in ticks.ts
    return actionId;
  },
});
