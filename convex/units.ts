import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

type UnitType = "spearman" | "archer" | "cavalry" | "siege" | "builder" | "scout";

interface UnitStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;
}

function getBaseStats(type: UnitType): UnitStats {
  switch (type) {
    case "spearman": return { hp: 20, maxHp: 20, atk: 3, def: 3, mov: 2 };
    case "archer":   return { hp: 15, maxHp: 15, atk: 5, def: 1, mov: 2 };
    case "cavalry":  return { hp: 20, maxHp: 20, atk: 4, def: 2, mov: 4 };
    case "siege":    return { hp: 25, maxHp: 25, atk: 7, def: 1, mov: 1 };
    case "builder":  return { hp: 10, maxHp: 10, atk: 1, def: 1, mov: 2 };
    case "scout":    return { hp: 12, maxHp: 12, atk: 2, def: 1, mov: 4 };
  }
}

const UNIT_NAMES: Record<UnitType, string[]> = {
  spearman: ["Gilgamesh's Guard", "Warrior of Ur", "Spear of Ashur"],
  archer:   ["Eye of Ishtar", "Arrow of Nippur", "Hunter of Nineveh"],
  cavalry:  ["Rider of Akkad", "Horseman of Babylon", "Swift Lance"],
  siege:    ["Ram of the Gates", "Siege Engine", "Tower of Destruction"],
  builder:  ["Builder of Ur", "Mason of Nippur", "Craftsman"],
  scout:    ["Scout of the Wasteland", "Eyes of the King", "Desert Wanderer"],
};

function generateUnitName(type: UnitType): string {
  const names = UNIT_NAMES[type];
  return names[Math.floor(Math.random() * names.length)];
}

export const getUnitsForPlayer = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    return await ctx.db
      .query("units")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .filter((q) => q.neq(q.field("status"), "dead"))
      .collect();
  },
});

export const getUnitsAtHex = query({
  args: { q: v.number(), r: v.number() },
  handler: async (ctx, { q, r }) => {
    return await ctx.db
      .query("units")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .filter((qb) => qb.neq(qb.field("status"), "dead"))
      .collect();
  },
});

export const createUnit = mutation({
  args: {
    ownerId: v.string(),
    type: v.union(
      v.literal("spearman"),
      v.literal("archer"),
      v.literal("cavalry"),
      v.literal("siege"),
      v.literal("builder"),
      v.literal("scout")
    ),
    q: v.number(),
    r: v.number(),
  },
  handler: async (ctx, { ownerId, type, q, r }) => {
    const stats = getBaseStats(type);
    const name = generateUnitName(type);
    return await ctx.db.insert("units", {
      ownerId,
      type,
      q,
      r,
      ...stats,
      status: "idle",
      name,
    });
  },
});

export const moveUnit = mutation({
  args: { unitId: v.id("units"), q: v.number(), r: v.number() },
  handler: async (ctx, { unitId, q, r }) => {
    const unit = await ctx.db.get(unitId);
    if (!unit) return;
    await ctx.db.patch(unitId, { q, r, status: "idle" });
  },
});

export const fortifyUnit = mutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, { unitId }) => {
    await ctx.db.patch(unitId, { status: "fortified" });
  },
});

export const damageUnit = mutation({
  args: { unitId: v.id("units"), amount: v.number() },
  handler: async (ctx, { unitId, amount }) => {
    const unit = await ctx.db.get(unitId);
    if (!unit) return;
    const newHp = unit.hp - amount;
    if (newHp <= 0) {
      await ctx.db.patch(unitId, { hp: 0, status: "dead" });
    } else {
      await ctx.db.patch(unitId, { hp: newHp });
    }
  },
});

export const killUnit = mutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, { unitId }) => {
    await ctx.db.patch(unitId, { hp: 0, status: "dead" });
  },
});

export const internalDeleteAllUnits = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const units = await ctx.db
      .query("units")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const unit of units) {
      await ctx.db.delete(unit._id);
    }
  },
});

export const internalCreateUnit = internalMutation({
  args: {
    ownerId: v.string(),
    type: v.union(
      v.literal("spearman"),
      v.literal("archer"),
      v.literal("cavalry"),
      v.literal("siege"),
      v.literal("builder"),
      v.literal("scout")
    ),
    q: v.number(),
    r: v.number(),
  },
  handler: async (ctx, { ownerId, type, q, r }) => {
    const stats = getBaseStats(type);
    const name = generateUnitName(type);
    return await ctx.db.insert("units", {
      ownerId,
      type,
      q,
      r,
      ...stats,
      status: "idle",
      name,
    });
  },
});

export const internalMoveUnit = internalMutation({
  args: { unitId: v.id("units"), q: v.number(), r: v.number() },
  handler: async (ctx, { unitId, q, r }) => {
    await ctx.db.patch(unitId, { q, r, status: "idle" });
  },
});

export const internalFortifyUnit = internalMutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, { unitId }) => {
    await ctx.db.patch(unitId, { status: "fortified" });
  },
});

export const internalDamageUnit = internalMutation({
  args: { unitId: v.id("units"), amount: v.number() },
  handler: async (ctx, { unitId, amount }) => {
    const unit = await ctx.db.get(unitId);
    if (!unit) return false;
    const newHp = unit.hp - amount;
    if (newHp <= 0) {
      await ctx.db.patch(unitId, { hp: 0, status: "dead" });
      return true; // died
    } else {
      await ctx.db.patch(unitId, { hp: newHp });
      return false;
    }
  },
});

export const internalKillUnit = internalMutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, { unitId }) => {
    await ctx.db.patch(unitId, { hp: 0, status: "dead" });
  },
});

export const internalGetUnitsAtHex = internalQuery({
  args: { q: v.number(), r: v.number() },
  handler: async (ctx, { q, r }) => {
    return await ctx.db
      .query("units")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .filter((qb) => qb.neq(qb.field("status"), "dead"))
      .collect();
  },
});
