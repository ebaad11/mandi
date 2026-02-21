import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";

const PLAYER_COLORS = [
  "#e63946", "#2a9d8f", "#e9c46a", "#6a4c93",
  "#f4a261", "#264653", "#a8dadc", "#457b9d",
];

export const getPlayer = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const getPlayerById = query({
  args: { id: v.id("players") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const createPlayer = mutation({
  args: {
    userId: v.string(),
    leaderName: v.string(),
    civName: v.string(),
    civDescription: v.string(),
    civBonus: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return existing._id;

    const allPlayers = await ctx.db.query("players").collect();
    const colorIndex = allPlayers.length % PLAYER_COLORS.length;
    const color = PLAYER_COLORS[colorIndex];

    // Random spawn in ±100 from origin
    const startQ = Math.floor(Math.random() * 200) - 100;
    const startR = Math.floor(Math.random() * 200) - 100;

    const now = Date.now();
    return await ctx.db.insert("players", {
      userId: args.userId,
      leaderName: args.leaderName,
      civName: args.civName,
      civDescription: args.civDescription,
      civBonus: args.civBonus,
      startQ,
      startR,
      grain: 10,
      stone: 10,
      gold: 5,
      knowledge: 3,
      actionPoints: 10,
      maxActionPoints: 10,
      apResetsAt: now + 60 * 60 * 1000,
      status: "active",
      onboarded: true,
      color,
    });
  },
});

export const updateResources = mutation({
  args: {
    playerId: v.id("players"),
    delta: v.object({
      grain: v.number(),
      stone: v.number(),
      gold: v.number(),
      knowledge: v.number(),
    }),
  },
  handler: async (ctx, { playerId, delta }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return;
    await ctx.db.patch(playerId, {
      grain: Math.max(0, player.grain + delta.grain),
      stone: Math.max(0, player.stone + delta.stone),
      gold: Math.max(0, player.gold + delta.gold),
      knowledge: Math.max(0, player.knowledge + delta.knowledge),
    });
  },
});

export const deductAP = mutation({
  args: { playerId: v.id("players"), amount: v.number() },
  handler: async (ctx, { playerId, amount }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found");
    if (player.actionPoints < amount) throw new Error("Insufficient AP");
    await ctx.db.patch(playerId, {
      actionPoints: player.actionPoints - amount,
    });
  },
});

export const resetAP = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return;
    await ctx.db.patch(playerId, {
      actionPoints: player.maxActionPoints,
      apResetsAt: Date.now() + 60 * 60 * 1000,
    });
  },
});

export const getAllActivePlayers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("players")
      .filter((q) => q.neq(q.field("status"), "defeated"))
      .collect();
  },
});

export const getAllPlayerColors = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    return players.map((p) => ({
      userId: p.userId,
      civName: p.civName,
      color: p.color,
    }));
  },
});

export const internalResetAP = internalMutation({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db
      .query("players")
      .filter((q) => q.neq(q.field("status"), "defeated"))
      .collect();
    const now = Date.now();
    for (const player of players) {
      await ctx.db.patch(player._id, {
        actionPoints: player.maxActionPoints,
        apResetsAt: now + 60 * 60 * 1000,
      });
    }
  },
});

export const internalUpdateResources = internalMutation({
  args: {
    playerId: v.id("players"),
    delta: v.object({
      grain: v.number(),
      stone: v.number(),
      gold: v.number(),
      knowledge: v.number(),
    }),
  },
  handler: async (ctx, { playerId, delta }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return;
    await ctx.db.patch(playerId, {
      grain: Math.max(0, player.grain + delta.grain),
      stone: Math.max(0, player.stone + delta.stone),
      gold: Math.max(0, player.gold + delta.gold),
      knowledge: Math.max(0, player.knowledge + delta.knowledge),
    });
  },
});
