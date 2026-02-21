import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    userId: v.string(),
    leaderName: v.string(),
    civName: v.string(),
    civDescription: v.string(),
    civBonus: v.string(),
    startQ: v.number(),
    startR: v.number(),
    grain: v.number(),
    stone: v.number(),
    gold: v.number(),
    knowledge: v.number(),
    actionPoints: v.number(),
    maxActionPoints: v.number(),
    apResetsAt: v.number(),
    status: v.union(v.literal("active"), v.literal("idle"), v.literal("defeated")),
    onboarded: v.boolean(),
    color: v.string(),
  }).index("by_userId", ["userId"]),

  advisors: defineTable({
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
    mood: v.union(
      v.literal("confident"),
      v.literal("worried"),
      v.literal("desperate"),
      v.literal("triumphant"),
      v.literal("suspicious"),
      v.literal("mourning")
    ),
    loyaltyScore: v.number(),
    systemPrompt: v.string(),
  }).index("by_playerId", ["playerId"]),

  tiles: defineTable({
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
    .index("by_q_r", ["q", "r"])
    .index("by_ownerId", ["ownerId"]),

  units: defineTable({
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
    hp: v.number(),
    maxHp: v.number(),
    atk: v.number(),
    def: v.number(),
    mov: v.number(),
    status: v.union(
      v.literal("idle"),
      v.literal("fortified"),
      v.literal("besieging"),
      v.literal("dead")
    ),
    name: v.string(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_q_r", ["q", "r"]),

  pendingActions: defineTable({
    playerId: v.string(),
    unitId: v.union(v.id("units"), v.null()),
    type: v.string(),
    targetQ: v.number(),
    targetR: v.number(),
    submittedAt: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("resolved"),
      v.literal("cancelled")
    ),
    apCost: v.number(),
    targetPlayerId: v.union(v.string(), v.null()),
    diplomacyType: v.union(v.string(), v.null()),
  })
    .index("by_playerId_status", ["playerId", "status"])
    .index("by_status", ["status"]),

  events: defineTable({
    tickNumber: v.number(),
    type: v.string(),
    actorId: v.string(),
    targetId: v.union(v.string(), v.null()),
    q: v.number(),
    r: v.number(),
    outcome: v.string(),
    narrative: v.string(),
    timestamp: v.number(),
  })
    .index("by_tickNumber", ["tickNumber"])
    .index("by_actorId", ["actorId"]),

  ticks: defineTable({
    tickNumber: v.number(),
    resolvedAt: v.number(),
    actionsProcessed: v.number(),
  }).index("by_tickNumber", ["tickNumber"]),
});
