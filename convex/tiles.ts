import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// --- Hex Math Utilities ---

export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q2 - q1;
  const dr = r2 - r1;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function hexesInRadius(
  centerQ: number,
  centerR: number,
  N: number
): Array<{ q: number; r: number }> {
  const hexes: Array<{ q: number; r: number }> = [];
  for (let dq = -N; dq <= N; dq++) {
    const rMin = Math.max(-N, -dq - N);
    const rMax = Math.min(N, -dq + N);
    for (let dr = rMin; dr <= rMax; dr++) {
      hexes.push({ q: centerQ + dq, r: centerR + dr });
    }
  }
  return hexes;
}

export const HEX_DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

// --- Seeded Deterministic Terrain ---

function seededRandom(q: number, r: number, salt: number): number {
  let h = 2166136261;
  h ^= (q + 10000) & 0xffffffff;
  h = Math.imul(h, 16777619);
  h ^= (r + 10000) & 0xffffffff;
  h = Math.imul(h, 16777619);
  h ^= salt;
  h = Math.imul(h, 16777619);
  return (h >>> 0) / 4294967296;
}

type Terrain = "plains" | "desert" | "mountain" | "forest" | "river" | "sea";
type HiddenResource = "grain" | "stone" | "gold" | "knowledge" | null;

function generateTerrain(q: number, r: number): Terrain {
  const v = seededRandom(q, r, 1);
  if (v < 0.05) return "sea";
  if (v < 0.15) return "river";
  if (v < 0.30) return "mountain";
  if (v < 0.45) return "forest";
  if (v < 0.65) return "desert";
  return "plains";
}

function generateHiddenResource(
  q: number,
  r: number
): { resource: HiddenResource; amount: number } {
  const rv = seededRandom(q, r, 2);
  if (rv < 0.40) return { resource: null, amount: 0 };
  if (rv < 0.65) return { resource: "grain", amount: Math.floor(seededRandom(q, r, 3) * 5) + 1 };
  if (rv < 0.85) return { resource: "stone", amount: Math.floor(seededRandom(q, r, 3) * 5) + 1 };
  if (rv < 0.95) return { resource: "gold", amount: Math.floor(seededRandom(q, r, 3) * 3) + 1 };
  return { resource: "knowledge", amount: Math.floor(seededRandom(q, r, 3) * 3) + 1 };
}

function baseYieldForTerrain(terrain: Terrain) {
  switch (terrain) {
    case "plains":   return { grain: 2, stone: 0, gold: 0, knowledge: 0 };
    case "desert":   return { grain: 0, stone: 1, gold: 1, knowledge: 0 };
    case "mountain": return { grain: 0, stone: 3, gold: 0, knowledge: 0 };
    case "forest":   return { grain: 1, stone: 1, gold: 0, knowledge: 0 };
    case "river":    return { grain: 1, stone: 0, gold: 2, knowledge: 0 };
    case "sea":      return { grain: 0, stone: 0, gold: 1, knowledge: 1 };
  }
}

function generateTileData(q: number, r: number) {
  const terrain = generateTerrain(q, r);
  const { resource, amount } = generateHiddenResource(q, r);
  return {
    q,
    r,
    terrain,
    baseYield: baseYieldForTerrain(terrain),
    hiddenResource: resource,
    hiddenAmount: amount,
    resourceRevealed: false,
    ownerId: null,
    improvement: "none" as const,
    discoveredBy: [] as string[],
    surveyedBy: [] as string[],
    fortifiedBy: null,
  };
}

// --- Queries ---

export const getTile = query({
  args: { q: v.number(), r: v.number() },
  handler: async (ctx, { q, r }) => {
    return await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
  },
});

export const getTilesInRadius = query({
  args: { centerQ: v.number(), centerR: v.number(), radius: v.number() },
  handler: async (ctx, { centerQ, centerR, radius }) => {
    const hexes = hexesInRadius(centerQ, centerR, radius);
    const tiles = [];
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile) tiles.push(tile);
    }
    return tiles;
  },
});

// --- Internal mutations for batch creation ---

export const internalCreateTilesBatch = internalMutation({
  args: {
    tiles: v.array(
      v.object({
        q: v.number(),
        r: v.number(),
        terrain: v.union(
          v.literal("plains"),
          v.literal("desert"),
          v.literal("mountain"),
          v.literal("forest"),
          v.literal("river"),
          v.literal("sea")
        ),
        baseYield: v.object({
          grain: v.number(),
          stone: v.number(),
          gold: v.number(),
          knowledge: v.number(),
        }),
        hiddenResource: v.union(
          v.literal("grain"),
          v.literal("stone"),
          v.literal("gold"),
          v.literal("knowledge"),
          v.null()
        ),
        hiddenAmount: v.number(),
        resourceRevealed: v.boolean(),
        ownerId: v.union(v.string(), v.null()),
        improvement: v.union(
          v.literal("none"),
          v.literal("farm"),
          v.literal("mine"),
          v.literal("settlement"),
          v.literal("fortress")
        ),
        discoveredBy: v.array(v.string()),
        surveyedBy: v.array(v.string()),
        fortifiedBy: v.union(v.string(), v.null()),
      })
    ),
  },
  handler: async (ctx, { tiles }) => {
    for (const tile of tiles) {
      // Check if already exists
      const existing = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (q) => q.eq("q", tile.q).eq("r", tile.r))
        .first();
      if (!existing) {
        await ctx.db.insert("tiles", tile);
      }
    }
  },
});

export const internalRevealTilesBatch = internalMutation({
  args: {
    hexes: v.array(v.object({ q: v.number(), r: v.number() })),
    userId: v.string(),
  },
  handler: async (ctx, { hexes, userId }) => {
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile && !tile.discoveredBy.includes(userId)) {
        await ctx.db.patch(tile._id, {
          discoveredBy: [...tile.discoveredBy, userId],
        });
      }
    }
  },
});

// --- Action: get or create tiles in radius ---

export const getOrCreateTilesInRadius = action({
  args: {
    centerQ: v.number(),
    centerR: v.number(),
    radius: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, { centerQ, centerR, radius, userId }) => {
    const hexes = hexesInRadius(centerQ, centerR, radius);

    // Generate tile data for all hexes
    const tilesToCreate = hexes.map((h) => generateTileData(h.q, h.r));

    // Batch insert ~50 per mutation
    const BATCH_SIZE = 50;
    for (let i = 0; i < tilesToCreate.length; i += BATCH_SIZE) {
      const batch = tilesToCreate.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.tiles.internalCreateTilesBatch, { tiles: batch });
    }

    // Reveal tiles for user
    for (let i = 0; i < hexes.length; i += BATCH_SIZE) {
      const batch = hexes.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.tiles.internalRevealTilesBatch, { hexes: batch, userId });
    }
  },
});

// --- Mutations ---

export const revealTiles = mutation({
  args: {
    hexes: v.array(v.object({ q: v.number(), r: v.number() })),
    userId: v.string(),
  },
  handler: async (ctx, { hexes, userId }) => {
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile && !tile.discoveredBy.includes(userId)) {
        await ctx.db.patch(tile._id, {
          discoveredBy: [...tile.discoveredBy, userId],
        });
      }
    }
  },
});

export const revealResource = mutation({
  args: { q: v.number(), r: v.number(), userId: v.string() },
  handler: async (ctx, { q, r, userId }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    const updates: Record<string, unknown> = {};
    if (!tile.surveyedBy.includes(userId)) {
      updates.surveyedBy = [...tile.surveyedBy, userId];
    }
    if (tile.ownerId === userId) {
      updates.resourceRevealed = true;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(tile._id, updates);
    }
  },
});

export const claimTile = mutation({
  args: {
    q: v.number(),
    r: v.number(),
    ownerId: v.string(),
    improvement: v.union(
      v.literal("none"),
      v.literal("farm"),
      v.literal("mine"),
      v.literal("settlement"),
      v.literal("fortress")
    ),
  },
  handler: async (ctx, { q, r, ownerId, improvement }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { ownerId, improvement });
  },
});

export const fortifyTile = mutation({
  args: { q: v.number(), r: v.number(), unitId: v.string() },
  handler: async (ctx, { q, r, unitId }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { fortifiedBy: unitId });
  },
});

export const improveTile = mutation({
  args: {
    q: v.number(),
    r: v.number(),
    improvement: v.union(
      v.literal("none"),
      v.literal("farm"),
      v.literal("mine"),
      v.literal("settlement"),
      v.literal("fortress")
    ),
  },
  handler: async (ctx, { q, r, improvement }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { improvement });
  },
});

// Single consolidated query — returns tiles + all units in area + player colors
// Avoids N+1 HTTP round-trips from the MCP server
export const getMapBundle = query({
  args: { centerQ: v.number(), centerR: v.number(), radius: v.number() },
  handler: async (ctx, { centerQ, centerR, radius }) => {
    const hexes = hexesInRadius(centerQ, centerR, radius);
    const hexSet = new Set(hexes.map((h) => `${h.q},${h.r}`));

    // Fetch all tiles in radius (N DB reads, but inside Convex = fast)
    const tiles = [];
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile) tiles.push(tile);
    }

    // Fetch all live units, filter to those in radius
    const allUnits = await ctx.db
      .query("units")
      .filter((q) => q.neq(q.field("status"), "dead"))
      .collect();
    const units = allUnits.filter((u) => hexSet.has(`${u.q},${u.r}`));

    // Player color map
    const players = await ctx.db.query("players").collect();
    const playerColors = players.map((p) => ({
      userId: p.userId,
      civName: p.civName,
      color: p.color,
    }));

    return { tiles, units, playerColors };
  },
});

// Count tiles owned by a player — uses index, no full table scan
export const getTerritoryCount = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const owned = await ctx.db
      .query("tiles")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    return owned.length;
  },
});

export const internalReleaseTiles = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const tiles = await ctx.db
      .query("tiles")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const tile of tiles) {
      await ctx.db.patch(tile._id, {
        ownerId: null,
        improvement: "none",
        fortifiedBy: null,
      });
    }
  },
});

export const internalFortifyTile = internalMutation({
  args: { q: v.number(), r: v.number(), unitId: v.string() },
  handler: async (ctx, { q, r, unitId }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { fortifiedBy: unitId });
  },
});

export const internalClaimTile = internalMutation({
  args: {
    q: v.number(),
    r: v.number(),
    ownerId: v.string(),
    improvement: v.union(
      v.literal("none"),
      v.literal("farm"),
      v.literal("mine"),
      v.literal("settlement"),
      v.literal("fortress")
    ),
  },
  handler: async (ctx, { q, r, ownerId, improvement }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { ownerId, improvement });
  },
});

export const internalImproveTile = internalMutation({
  args: {
    q: v.number(),
    r: v.number(),
    improvement: v.union(
      v.literal("none"),
      v.literal("farm"),
      v.literal("mine"),
      v.literal("settlement"),
      v.literal("fortress")
    ),
  },
  handler: async (ctx, { q, r, improvement }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { improvement });
  },
});

export const internalRevealTiles = internalMutation({
  args: {
    hexes: v.array(v.object({ q: v.number(), r: v.number() })),
    userId: v.string(),
  },
  handler: async (ctx, { hexes, userId }) => {
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile && !tile.discoveredBy.includes(userId)) {
        await ctx.db.patch(tile._id, {
          discoveredBy: [...tile.discoveredBy, userId],
        });
      }
    }
  },
});

export const internalRevealResource = internalMutation({
  args: { q: v.number(), r: v.number(), userId: v.string() },
  handler: async (ctx, { q, r, userId }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    const updates: Record<string, unknown> = {};
    if (!tile.surveyedBy.includes(userId)) {
      updates.surveyedBy = [...tile.surveyedBy, userId];
    }
    if (tile.ownerId === userId) {
      updates.resourceRevealed = true;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(tile._id, updates);
    }
  },
});

export const internalClearFortifiedBy = internalMutation({
  args: { q: v.number(), r: v.number() },
  handler: async (ctx, { q, r }) => {
    const tile = await ctx.db
      .query("tiles")
      .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
      .first();
    if (!tile) return;
    await ctx.db.patch(tile._id, { fortifiedBy: null, ownerId: null });
  },
});

export const internalGetTilesInRadius = internalQuery({
  args: { centerQ: v.number(), centerR: v.number(), radius: v.number() },
  handler: async (ctx, { centerQ, centerR, radius }) => {
    const hexes = hexesInRadius(centerQ, centerR, radius);
    const tiles = [];
    for (const { q, r } of hexes) {
      const tile = await ctx.db
        .query("tiles")
        .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
        .first();
      if (tile) tiles.push(tile);
    }
    return tiles;
  },
});
