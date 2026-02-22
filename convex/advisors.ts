import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

function buildSystemPrompt(args: {
  name: string;
  title: string;
  archetype: string;
  aggression: number;
  caution: number;
  mysticism: number;
  speechStyle: string;
  catchphrase: string;
  favoredStrategy: string;
  backstory: string;
  mood: string;
}): string {
  return `You are ${args.name}, ${args.title}. Archetype: ${args.archetype}.
Personality: aggression=${args.aggression}/10, caution=${args.caution}/10, mysticism=${args.mysticism}/10.
Speech: ${args.speechStyle}. Catchphrase: '${args.catchphrase}'.
Strategy: ${args.favoredStrategy}. Background: ${args.backstory}.
Current mood: ${args.mood}. Stay in character always.`;
}

export const getAdvisor = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db
      .query("advisors")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .first();
  },
});

export const createAdvisor = mutation({
  args: {
    playerId: v.id("players"),
    name: v.string(),
    title: v.string(),
    archetype: v.union(
      v.literal("strategist"),
      v.literal("warmonger"),
      v.literal("merchant"),
      v.literal("scholar"),
      v.literal("mystic"),
      v.literal("diplomat")
    ),
    aggression: v.number(),
    caution: v.number(),
    mysticism: v.number(),
    verbosity: v.number(),
    bluntness: v.number(),
    speechStyle: v.string(),
    catchphrase: v.string(),
    favoredStrategy: v.string(),
    backstory: v.string(),
  },
  handler: async (ctx, args) => {
    const mood = "confident" as const;
    const systemPrompt = buildSystemPrompt({ ...args, mood });
    return await ctx.db.insert("advisors", {
      ...args,
      mood,
      loyaltyScore: 50,
      systemPrompt,
    });
  },
});

export const updateMood = mutation({
  args: {
    advisorId: v.id("advisors"),
    mood: v.union(
      v.literal("confident"),
      v.literal("worried"),
      v.literal("desperate"),
      v.literal("triumphant"),
      v.literal("suspicious"),
      v.literal("mourning")
    ),
  },
  handler: async (ctx, { advisorId, mood }) => {
    const advisor = await ctx.db.get(advisorId);
    if (!advisor) return;
    const systemPrompt = buildSystemPrompt({ ...advisor, mood });
    await ctx.db.patch(advisorId, { mood, systemPrompt });
  },
});

export const decrementLoyalty = mutation({
  args: { advisorId: v.id("advisors") },
  handler: async (ctx, { advisorId }) => {
    const advisor = await ctx.db.get(advisorId);
    if (!advisor) return;
    await ctx.db.patch(advisorId, {
      loyaltyScore: Math.max(0, advisor.loyaltyScore - 5),
    });
  },
});

export const incrementLoyalty = mutation({
  args: { advisorId: v.id("advisors") },
  handler: async (ctx, { advisorId }) => {
    const advisor = await ctx.db.get(advisorId);
    if (!advisor) return;
    await ctx.db.patch(advisorId, {
      loyaltyScore: Math.min(100, advisor.loyaltyScore + 5),
    });
  },
});

export const internalDeleteAdvisor = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const advisor = await ctx.db
      .query("advisors")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .first();
    if (advisor) {
      await ctx.db.delete(advisor._id);
    }
  },
});

export const internalUpdateMood = internalMutation({
  args: {
    advisorId: v.id("advisors"),
    mood: v.union(
      v.literal("confident"),
      v.literal("worried"),
      v.literal("desperate"),
      v.literal("triumphant"),
      v.literal("suspicious"),
      v.literal("mourning")
    ),
  },
  handler: async (ctx, { advisorId, mood }) => {
    const advisor = await ctx.db.get(advisorId);
    if (!advisor) return;
    const systemPrompt = buildSystemPrompt({ ...advisor, mood });
    await ctx.db.patch(advisorId, { mood, systemPrompt });
  },
});
