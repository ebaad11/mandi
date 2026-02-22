import { MCPServer, text, widget, error, oauthWorkOSProvider } from "mcp-use/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";
import { z } from "zod";

// Local type aliases for Convex query return shapes
interface PlayerColor {
  userId: string;
  civName: string;
  color: string;
}

interface TileResult {
  _id: string;
  q: number;
  r: number;
  terrain: string;
  improvement: string;
  ownerId: string | null;
  fortifiedBy: string | null;
  discoveredBy: string[];
  surveyedBy: string[];
  baseYield: { grain: number; stone: number; gold: number; knowledge: number };
  hiddenResource: string | null;
  hiddenAmount: number;
  resourceRevealed: boolean;
}

interface UnitResult {
  _id: string;
  ownerId: string;
  type: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;
  status: string;
  name: string;
}

interface EventResult {
  _id: string;
  tickNumber: number;
  type: string;
  actorId: string;
  targetId: string | null;
  q: number;
  r: number;
  outcome: string;
  narrative: string;
  timestamp: number;
}

const AP_COSTS = {
  move: 1,
  attack: 2,
  defend: 1,
  invest: 2,
  found: 3,
  scout: 1,
  diplomacy: 1,
};

const MAP_RADIUS = 5;

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const server = new MCPServer({
  name: "civ-hex-game",
  title: "Ancient Civilization Strategy",
  version: "1.0.0",
  description: "A Civilization-style hex strategy game with an ancient Assyrian/Babylonian aesthetic. IMPORTANT: At the start of EVERY new conversation, call get-status FIRST to check if the player is already onboarded before asking any questions. Never ask the player to set up a civilization without calling get-status first.",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
  oauth: oauthWorkOSProvider(),
});

// Pending action shape passed to widget
interface PendingActionProp {
  unitId: string;
  type: string;
  fromQ: number;
  fromR: number;
  targetQ: number;
  targetR: number;
}

// Helper: fetch player's queued actions with unit positions resolved.
// Chains sequential moves for the same unit so ghosts form a trajectory
// (e.g. move A→B then B→C, not two arrows from A).
async function fetchPendingActions(userId: string): Promise<PendingActionProp[]> {
  const [actions, units] = await Promise.all([
    convex.query(api.actions.getQueuedActions, { playerId: userId }),
    convex.query(api.units.getUnitsForPlayer, { ownerId: userId }),
  ]);
  const unitMap = new Map((units as UnitResult[]).map((u) => [u._id, u]));

  // Track the "current" position per unit — starts at DB position,
  // then advances to each action's target so the next action chains from there.
  const unitPos = new Map<string, { q: number; r: number }>();
  for (const u of units as UnitResult[]) {
    unitPos.set(u._id, { q: u.q, r: u.r });
  }

  // Actions are returned in insertion order (submittedAt) from Convex
  return (actions as any[]).map((a) => {
    const uid = a.unitId ?? "";
    const pos = uid ? unitPos.get(uid) : null;
    const fromQ = pos?.q ?? a.targetQ;
    const fromR = pos?.r ?? a.targetR;

    // Advance the tracked position so the next action for this unit chains
    if (uid && (a.type === "move" || a.type === "attack")) {
      unitPos.set(uid, { q: a.targetQ, r: a.targetR });
    }

    return {
      unitId: uid,
      type: a.type,
      fromQ,
      fromR,
      targetQ: a.targetQ,
      targetR: a.targetR,
    };
  });
}

// Helper: get player map data centered on units
async function buildMapProps(
  userId: string,
  centerQ: number,
  centerR: number,
  playerColor: string,
  pendingActions?: PendingActionProp[]
) {
  // Single Convex call — tiles + units + player colors in one HTTP round-trip
  const bundle = await convex.query(api.tiles.getMapBundle, {
    centerQ,
    centerR,
    radius: MAP_RADIUS,
  }) as { tiles: TileResult[]; units: UnitResult[]; playerColors: PlayerColor[] };

  const { playerColors } = bundle;

  // Build unit lookup map by hex key
  const unitsByHex = new Map<string, UnitResult[]>();
  for (const u of bundle.units) {
    const key = `${u.q},${u.r}`;
    if (!unitsByHex.has(key)) unitsByHex.set(key, []);
    unitsByHex.get(key)!.push(u);
  }

  const tileProps = bundle.tiles.map((tile) => {
    const isVisible = tile.discoveredBy.includes(userId);
    const unitsAtHex = isVisible ? (unitsByHex.get(`${tile.q},${tile.r}`) ?? []) : [];

    const ownerColor = tile.ownerId
      ? (playerColors.find((p) => p.userId === tile.ownerId)?.color ?? null)
      : null;

    const isBorder =
      tile.fortifiedBy != null ||
      tile.improvement === "settlement" ||
      tile.improvement === "fortress";

    return {
      q: tile.q,
      r: tile.r,
      terrain: isVisible ? tile.terrain : "fog",
      improvement: isVisible ? tile.improvement : "none",
      ownerId: tile.ownerId,
      ownerColor,
      isBorder: isVisible && isBorder,
      isVisible,
      units: unitsAtHex.map((u) => ({
        id: u._id,
        type: u.type,
        ownerColor: playerColors.find((p) => p.userId === u.ownerId)?.color ?? "#888",
        isOwnUnit: u.ownerId === userId,
        // Include stats for own units so the widget can display info & compute ranges
        ...(u.ownerId === userId && {
          name: u.name,
          hp: u.hp,
          maxHp: u.maxHp,
          atk: u.atk,
          def: u.def,
          mov: u.mov,
          status: u.status,
        }),
      })),
    };
  });

  return {
    tiles: tileProps,
    playerColor,
    playerId: userId,
    centerQ,
    centerR,
    ...(pendingActions && pendingActions.length > 0 ? { pendingActions } : {}),
  };
}

// --- GET STATUS (call this first at the start of every conversation) ---
server.tool(
  {
    name: "get-status",
    description:
      "ALWAYS call this at the start of a new conversation before anything else. Returns the current game state: if the player is already onboarded it shows their map and profile so they can continue playing; if not onboarded it shows the onboarding form. Never ask the player to set up a civilization without calling this first.",
    schema: z.object({}),
    widget: {
      name: "game-widget",
      invoking: "Checking civilization status...",
      invoked: "Status loaded",
    },
  },
  async (_args, ctx) => {
    const userId = ctx.auth.user.userId;
    const player = await convex.query(api.players.getPlayer, { userId });

    if (!player) {
      // Not onboarded — show onboarding form
      return widget({
        props: {
          view: "onboarding",
          onboarding: {},
        },
        output: text(
          "Welcome to Ancient Empires! You have not yet founded a civilization. Use the onboard tool with your leader name, civilization name, description, bonus, and advisor details to begin."
        ),
      });
    }

    // Already onboarded — jump straight to the map
    const units = await convex.query(api.units.getUnitsForPlayer, { ownerId: userId });
    const centerQ = units[0]?.q ?? player.startQ;
    const centerR = units[0]?.r ?? player.startR;

    await convex.action(api.tiles.getOrCreateTilesInRadius, {
      centerQ,
      centerR,
      radius: MAP_RADIUS,
      userId,
    });

    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player),
    ]);
    const mapProps = await buildMapProps(userId, centerQ, centerR, player.color, pendingActions);

    return widget({
      props: {
        view: "map",
        map: { ...mapProps, playerStats },
      },
      output: text(
        `Welcome back, ${player.leaderName} of ${player.civName}! AP: ${player.actionPoints}/${player.maxActionPoints}. Use get-profile to see resources, get-map to explore, or issue orders to your units.`
      ),
    });
  }
);

// --- RESTART ---
server.tool(
  {
    name: "restart",
    description:
      "Completely wipe your civilization and start over. Deletes your player, advisor, units, pending actions, and releases all owned tiles. Returns you to the onboarding screen so you can re-create from scratch.",
    schema: z.object({}),
    widget: {
      name: "game-widget",
      invoking: "Erasing your civilization...",
      invoked: "Civilization erased",
    },
  },
  async (_args, ctx) => {
    const userId = ctx.auth.user.userId;
    const player = await convex.query(api.players.getPlayer, { userId });
    if (!player) {
      return widget({
        props: {
          view: "onboarding",
          onboarding: {},
        },
        output: text("You don't have a civilization yet. Use the onboard tool to create one."),
      });
    }

    await convex.action(api.players.resetPlayer, { userId });

    return widget({
      props: {
        view: "onboarding",
        onboarding: {},
      },
      output: text(
        "Your civilization has been erased from history. Use the onboard tool to found a new civilization."
      ),
    });
  }
);

// --- ONBOARD ---
server.tool(
  {
    name: "onboard",
    description:
      "Create your civilization and advisor. Only call this if get-status confirmed the player is NOT yet onboarded. Provide leader name, civilization name, description, bonus, and advisor details.",
    schema: z.object({
      leaderName: z.string().describe("Your leader's name (e.g. 'Ashurbanipal')"),
      civName: z.string().describe("Your civilization's name (e.g. 'The Assyrian Empire')"),
      civDescription: z.string().describe("A brief description of your civilization"),
      civBonus: z.string().describe("A unique bonus or trait for your civilization (e.g. '+1 stone from mountains')"),
      advisorName: z.string().describe("Your advisor's name"),
      advisorTitle: z.string().describe("Your advisor's title (e.g. 'High Vizier')"),
      advisorArchetype: z
        .enum(["strategist", "warmonger", "merchant", "scholar", "mystic", "diplomat"])
        .describe("Your advisor's archetype"),
      advisorCatchphrase: z.string().describe("A memorable phrase your advisor often says"),
      advisorBackstory: z.string().describe("Brief background of your advisor"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Founding civilization...",
      invoked: "Civilization founded",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;

    const existing = await convex.query(api.players.getPlayer, { userId });
    if (existing) {
      return error("Already onboarded. Your civilization already exists.");
    }

    // Derive advisor personality from archetype
    const archetypeDefaults: Record<
      string,
      {
        aggression: number;
        caution: number;
        mysticism: number;
        verbosity: number;
        bluntness: number;
        speechStyle: string;
        favoredStrategy: string;
      }
    > = {
      strategist: {
        aggression: 5, caution: 7, mysticism: 3, verbosity: 6, bluntness: 5,
        speechStyle: "Calculated and precise, speaks in analogies",
        favoredStrategy: "Long-term economic and military balance",
      },
      warmonger: {
        aggression: 9, caution: 2, mysticism: 1, verbosity: 4, bluntness: 9,
        speechStyle: "Aggressive and direct, uses battle metaphors",
        favoredStrategy: "Constant expansion through military conquest",
      },
      merchant: {
        aggression: 2, caution: 6, mysticism: 2, verbosity: 7, bluntness: 3,
        speechStyle: "Smooth and persuasive, mentions trade and profit",
        favoredStrategy: "Wealth accumulation and economic dominance",
      },
      scholar: {
        aggression: 1, caution: 8, mysticism: 6, verbosity: 9, bluntness: 2,
        speechStyle: "Verbose and philosophical, quotes ancient texts",
        favoredStrategy: "Knowledge gathering and technological advancement",
      },
      mystic: {
        aggression: 4, caution: 5, mysticism: 10, verbosity: 6, bluntness: 4,
        speechStyle: "Cryptic and prophetic, speaks of omens",
        favoredStrategy: "Following divine signs and spiritual power",
      },
      diplomat: {
        aggression: 2, caution: 7, mysticism: 3, verbosity: 8, bluntness: 2,
        speechStyle: "Charming and indirect, always seeks compromise",
        favoredStrategy: "Alliance building and peaceful expansion",
      },
    };

    const defaults = archetypeDefaults[args.advisorArchetype];

    // Create player
    const playerId = await convex.mutation(api.players.createPlayer, {
      userId,
      leaderName: args.leaderName,
      civName: args.civName,
      civDescription: args.civDescription,
      civBonus: args.civBonus,
    });

    const player = await convex.query(api.players.getPlayerById, { id: playerId });
    if (!player) return error("Failed to create player record.");

    // Create advisor
    await convex.mutation(api.advisors.createAdvisor, {
      playerId,
      name: args.advisorName,
      title: args.advisorTitle,
      archetype: args.advisorArchetype,
      catchphrase: args.advisorCatchphrase,
      backstory: args.advisorBackstory,
      ...defaults,
    });

    // Create starting units: 2 spearmen + 1 scout
    await convex.mutation(api.units.createUnit, {
      ownerId: userId,
      type: "spearman",
      q: player.startQ,
      r: player.startR,
    });
    await convex.mutation(api.units.createUnit, {
      ownerId: userId,
      type: "spearman",
      q: player.startQ + 1,
      r: player.startR,
    });
    await convex.mutation(api.units.createUnit, {
      ownerId: userId,
      type: "scout",
      q: player.startQ,
      r: player.startR + 1,
    });

    // Generate tiles in radius 3 around spawn and reveal them
    await convex.action(api.tiles.getOrCreateTilesInRadius, {
      centerQ: player.startQ,
      centerR: player.startR,
      radius: 3,
      userId,
    });

    // Claim the starting tile with a settlement so the player owns territory from the start
    await convex.mutation(api.tiles.claimTile, {
      q: player.startQ,
      r: player.startR,
      ownerId: userId,
      improvement: "settlement",
    });

    // Build map props (no pending actions for fresh onboard)
    const [mapProps, playerStats] = await Promise.all([
      buildMapProps(userId, player.startQ, player.startR, player.color, []),
      buildPlayerStats(player),
    ]);

    return widget({
      props: {
        view: "map",
        map: { ...mapProps, playerStats },
      },
      output: text(
        `Welcome, ${args.leaderName}! Your civilization "${args.civName}" has been founded. ` +
        `${args.advisorName} stands ready to advise you. Your forces await at (${player.startQ}, ${player.startR}). ` +
        `You begin with 10 AP. Use get-map to survey your lands, move to advance your units, or scout to reveal fog of war.`
      ),
    });
  }
);

// --- GET MAP ---
server.tool(
  {
    name: "get-map",
    description: "View your civilization's map showing terrain, units, borders, and fog of war.",
    schema: z.object({
      centerQ: z.number().optional().describe("Center Q coordinate (defaults to first unit position)"),
      centerR: z.number().optional().describe("Center R coordinate (defaults to first unit position)"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Loading map...",
      invoked: "Map loaded",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const player = await convex.query(api.players.getPlayer, { userId });
    if (!player) return error("Not onboarded. Use the onboard tool first.");

    const units = await convex.query(api.units.getUnitsForPlayer, { ownerId: userId });

    let centerQ = args.centerQ ?? (units[0]?.q ?? player.startQ);
    let centerR = args.centerR ?? (units[0]?.r ?? player.startR);

    // Generate any missing tiles
    await convex.action(api.tiles.getOrCreateTilesInRadius, {
      centerQ,
      centerR,
      radius: MAP_RADIUS,
      userId,
    });

    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player),
    ]);
    const mapProps = await buildMapProps(userId, centerQ, centerR, player.color, pendingActions);

    return widget({
      props: {
        view: "map",
        map: { ...mapProps, playerStats },
      },
      output: text(
        `Map centered at (${centerQ}, ${centerR}). AP: ${player.actionPoints}/${player.maxActionPoints}.`
      ),
    });
  }
);

// --- GET PROFILE ---
server.tool(
  {
    name: "get-profile",
    description: "View your civilization's profile: resources, action points, advisor, and units.",
    schema: z.object({}),
    widget: {
      name: "game-widget",
      invoking: "Loading profile...",
      invoked: "Profile loaded",
    },
  },
  async (_args, ctx) => {
    const userId = ctx.auth.user.userId;
    const player = await convex.query(api.players.getPlayer, { userId });
    if (!player) return error("Not onboarded. Use the onboard tool first.");

    const advisor = await convex.query(api.advisors.getAdvisor, { playerId: player._id });
    const units = await convex.query(api.units.getUnitsForPlayer, { ownerId: userId });
    const queuedActions = await convex.query(api.actions.getQueuedActions, { playerId: userId });

    // Count territory using indexed query (no scan)
    const territoryCount = await convex.query(api.tiles.getTerritoryCount, { ownerId: userId });

    return widget({
      props: {
        view: "profile",
        profile: {
          player: {
            leaderName: player.leaderName,
            civName: player.civName,
            civBonus: player.civBonus,
            color: player.color,
            grain: player.grain,
            stone: player.stone,
            gold: player.gold,
            knowledge: player.knowledge,
            actionPoints: player.actionPoints,
            maxActionPoints: player.maxActionPoints,
            apResetsAt: player.apResetsAt,
            nextTickAt: ((await convex.query(api.ticks.getLastTick, {})) ?? Date.now()) + 2 * 60 * 1000,
          },
          advisor: advisor
            ? {
                name: advisor.name,
                title: advisor.title,
                mood: advisor.mood,
                catchphrase: advisor.catchphrase,
                loyaltyScore: advisor.loyaltyScore,
              }
            : {
                name: "No Advisor",
                title: "",
                mood: "confident",
                catchphrase: "",
                loyaltyScore: 0,
              },
          units: (units as UnitResult[]).map((u) => ({
            id: u._id,
            name: u.name,
            type: u.type,
            hp: u.hp,
            maxHp: u.maxHp,
            status: u.status,
            q: u.q,
            r: u.r,
          })),
          queuedActionsCount: queuedActions.length,
          territoryCount,
        },
      },
      output: text(
        `${player.leaderName} of ${player.civName}. Resources: ${player.grain} grain, ${player.stone} stone, ${player.gold} gold, ${player.knowledge} knowledge. AP: ${player.actionPoints}/${player.maxActionPoints}.`
      ),
    });
  }
);

// --- GET EVENTS ---
server.tool(
  {
    name: "get-events",
    description: "View recent events and diplomatic dispatches from across the world.",
    schema: z.object({
      limit: z.number().optional().describe("Number of events to show (default 20)"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Consulting the scribes...",
      invoked: "Dispatches received",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const player = await convex.query(api.players.getPlayer, { userId });
    if (!player) return error("Not onboarded. Use the onboard tool first.");

    const limit = args.limit ?? 20;
    const events = await convex.query(api.events.getRecentEventsForPlayer, {
      playerId: userId,
      limit,
    });

    const allPlayers = await convex.query(api.players.getAllPlayerColors, {});
    const playerMap = new Map(
      (allPlayers as PlayerColor[]).map((p) => [p.userId, p.civName])
    );

    const eventProps = (events as EventResult[]).map((e) => ({
      tickNumber: e.tickNumber,
      type: e.type,
      actorCivName: playerMap.get(e.actorId) ?? "Unknown Civ",
      targetCivName: e.targetId ? (playerMap.get(e.targetId) ?? "Unknown Civ") : null,
      q: e.q,
      r: e.r,
      outcome: e.outcome,
      narrative: e.narrative,
      timestamp: e.timestamp,
    }));

    return widget({
      props: {
        view: "events",
        events: {
          events: eventProps,
          currentPlayerCivName: player.civName,
        },
      },
      output: text(
        `${events.length} recent dispatches for ${player.civName}. The scribes have spoken.`
      ),
    });
  }
);

// --- ACTION TOOLS HELPERS ---
async function validatePlayerAndUnit(
  userId: string,
  unitId?: string
) {
  const player = await convex.query(api.players.getPlayer, { userId });
  if (!player) return { err: "Not onboarded. Use the onboard tool first." };
  if (!player.onboarded) return { err: "Not onboarded." };
  if (player.status === "defeated") return { err: "Your civilization has been defeated." };
  return { player };
}

async function buildPlayerStats(player: any, apOverride?: number) {
  const [advisor, lastTickResolvedAt] = await Promise.all([
    convex.query(api.advisors.getAdvisor, { playerId: player._id }),
    convex.query(api.ticks.getLastTick, {}),
  ]);
  const nextTickAt = (lastTickResolvedAt ?? Date.now()) + 2 * 60 * 1000;
  return {
    leaderName: player.leaderName,
    civName: player.civName,
    grain: player.grain,
    stone: player.stone,
    gold: player.gold,
    knowledge: player.knowledge,
    actionPoints: apOverride !== undefined ? apOverride : player.actionPoints,
    maxActionPoints: player.maxActionPoints,
    apResetsAt: player.apResetsAt,
    nextTickAt,
    advisor: advisor
      ? {
          name: advisor.name,
          title: advisor.title,
          mood: advisor.mood,
          catchphrase: advisor.catchphrase,
          loyaltyScore: advisor.loyaltyScore,
        }
      : undefined,
  };
}

// --- MOVE ---
server.tool(
  {
    name: "move",
    description: "Queue a move action for one of your units to a target hex. Costs 1 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of the unit to move"),
      targetQ: z.number().describe("Target Q coordinate"),
      targetR: z.number().describe("Target R coordinate"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Ordering advance...",
      invoked: "Move queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.move) {
      return error(`Insufficient AP. Need ${AP_COSTS.move}, have ${player!.actionPoints}.`);
    }

    // Deduct AP
    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.move,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "move",
      targetQ: args.targetQ,
      targetR: args.targetR,
      apCost: AP_COSTS.move,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.move;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const moveMapProps = await buildMapProps(userId, args.targetQ, args.targetR, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...moveMapProps, playerStats } },
      output: text(`Move queued to (${args.targetQ}, ${args.targetR}). AP remaining: ${remaining}. Resolves at next tick (every 2 min).`),
    });
  }
);

// --- ATTACK ---
server.tool(
  {
    name: "attack",
    description: "Queue an attack on a target hex. Your unit must be adjacent. Costs 2 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of the attacking unit"),
      targetQ: z.number().describe("Target Q coordinate to attack"),
      targetR: z.number().describe("Target R coordinate to attack"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Marshaling forces...",
      invoked: "Attack queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.attack) {
      return error(`Insufficient AP. Need ${AP_COSTS.attack}, have ${player!.actionPoints}.`);
    }

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.attack,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "attack",
      targetQ: args.targetQ,
      targetR: args.targetR,
      apCost: AP_COSTS.attack,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.attack;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const attackMapProps = await buildMapProps(userId, args.targetQ, args.targetR, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...attackMapProps, playerStats } },
      output: text(`Attack queued at (${args.targetQ}, ${args.targetR}). AP remaining: ${remaining}. Resolves at next tick.`),
    });
  }
);

// --- DEFEND ---
server.tool(
  {
    name: "defend",
    description: "Queue a fortify/defend action for a unit at its current position. Establishes a border. Costs 1 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of the unit to fortify"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Digging in...",
      invoked: "Defend queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.defend) {
      return error(`Insufficient AP. Need ${AP_COSTS.defend}, have ${player!.actionPoints}.`);
    }

    const unit = await convex.query(api.units.getUnitsForPlayer, { ownerId: userId });
    const targetUnit = (unit as UnitResult[]).find((u) => u._id === args.unitId);
    if (!targetUnit) return error("Unit not found or not owned by you.");

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.defend,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "defend",
      targetQ: targetUnit.q,
      targetR: targetUnit.r,
      apCost: AP_COSTS.defend,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.defend;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const defendMapProps = await buildMapProps(userId, targetUnit.q, targetUnit.r, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...defendMapProps, playerStats } },
      output: text(`Defend queued at (${targetUnit.q}, ${targetUnit.r}). AP remaining: ${remaining}. Resolves at next tick.`),
    });
  }
);

// --- INVEST ---
server.tool(
  {
    name: "invest",
    description: "Queue an improvement on a tile you own (farm or mine based on terrain). Costs 2 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of a builder unit performing the work"),
      targetQ: z.number().describe("Target Q coordinate to improve"),
      targetR: z.number().describe("Target R coordinate to improve"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Building improvement...",
      invoked: "Invest queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.invest) {
      return error(`Insufficient AP. Need ${AP_COSTS.invest}, have ${player!.actionPoints}.`);
    }

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.invest,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "invest",
      targetQ: args.targetQ,
      targetR: args.targetR,
      apCost: AP_COSTS.invest,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.invest;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const investMapProps = await buildMapProps(userId, args.targetQ, args.targetR, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...investMapProps, playerStats } },
      output: text(`Invest queued at (${args.targetQ}, ${args.targetR}). AP remaining: ${remaining}. Resolves at next tick.`),
    });
  }
);

// --- FOUND ---
server.tool(
  {
    name: "found",
    description: "Found a settlement on an unclaimed tile. Permanently claims the tile and reveals its hidden resource. Costs 3 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of a unit at the founding location"),
      targetQ: z.number().describe("Target Q coordinate to found settlement"),
      targetR: z.number().describe("Target R coordinate to found settlement"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Founding settlement...",
      invoked: "Found queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.found) {
      return error(`Insufficient AP. Need ${AP_COSTS.found}, have ${player!.actionPoints}.`);
    }

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.found,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "found",
      targetQ: args.targetQ,
      targetR: args.targetR,
      apCost: AP_COSTS.found,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.found;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const foundMapProps = await buildMapProps(userId, args.targetQ, args.targetR, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...foundMapProps, playerStats } },
      output: text(`Settlement founding queued at (${args.targetQ}, ${args.targetR}). AP remaining: ${remaining}. Resolves at next tick.`),
    });
  }
);

// --- SCOUT ---
server.tool(
  {
    name: "scout",
    description: "Queue a scout action to reveal fog of war in radius 2 around the unit. Costs 1 AP.",
    schema: z.object({
      unitId: z.string().describe("ID of the scout unit"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Sending scouts...",
      invoked: "Scout queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.scout) {
      return error(`Insufficient AP. Need ${AP_COSTS.scout}, have ${player!.actionPoints}.`);
    }

    const units = await convex.query(api.units.getUnitsForPlayer, { ownerId: userId });
    const targetUnit = (units as UnitResult[]).find((u) => u._id === args.unitId);
    if (!targetUnit) return error("Unit not found or not owned by you.");

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.scout,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: args.unitId as any,
      type: "scout",
      targetQ: targetUnit.q,
      targetR: targetUnit.r,
      apCost: AP_COSTS.scout,
      targetPlayerId: null,
      diplomacyType: null,
    });

    const remaining = player!.actionPoints - AP_COSTS.scout;
    const [pendingActions, playerStats] = await Promise.all([
      fetchPendingActions(userId),
      buildPlayerStats(player!, remaining),
    ]);
    const scoutMapProps = await buildMapProps(userId, targetUnit.q, targetUnit.r, player!.color, pendingActions);
    return widget({
      props: { view: "map", map: { ...scoutMapProps, playerStats } },
      output: text(`Scout action queued at (${targetUnit.q}, ${targetUnit.r}). AP remaining: ${remaining}. Fog will be revealed at next tick.`),
    });
  }
);

// --- DIPLOMACY ---
server.tool(
  {
    name: "diplomacy",
    description: "Send a diplomatic gesture to another civilization (alliance, trade offer, warning, etc.). Costs 1 AP.",
    schema: z.object({
      targetPlayerUserId: z.string().describe("The userId of the target civilization"),
      diplomacyType: z
        .enum(["alliance", "trade", "warning", "tribute", "denounce"])
        .describe("Type of diplomatic action"),
      message: z.string().optional().describe("Optional message to accompany the diplomatic action"),
    }),
    widget: {
      name: "game-widget",
      invoking: "Dispatching envoy...",
      invoked: "Diplomacy queued",
    },
  },
  async (args, ctx) => {
    const userId = ctx.auth.user.userId;
    const { player, err } = await validatePlayerAndUnit(userId);
    if (err) return error(err);

    if (player!.actionPoints < AP_COSTS.diplomacy) {
      return error(`Insufficient AP. Need ${AP_COSTS.diplomacy}, have ${player!.actionPoints}.`);
    }

    const targetPlayer = await convex.query(api.players.getPlayer, { userId: args.targetPlayerUserId });
    if (!targetPlayer) return error("Target civilization not found.");

    await convex.mutation(api.players.deductAP, {
      playerId: player!._id,
      amount: AP_COSTS.diplomacy,
    });

    await convex.mutation(api.actions.queueAction, {
      playerId: userId,
      unitId: null,
      type: "diplomacy",
      targetQ: targetPlayer.startQ,
      targetR: targetPlayer.startR,
      apCost: AP_COSTS.diplomacy,
      targetPlayerId: args.targetPlayerUserId,
      diplomacyType: args.diplomacyType,
    });

    const remaining = player!.actionPoints - AP_COSTS.diplomacy;

    // Fetch recent events for events view
    const events = await convex.query(api.events.getRecentEventsForPlayer, {
      playerId: userId,
      limit: 10,
    });
    const allPlayers2 = await convex.query(api.players.getAllPlayerColors, {});
    const playerMap2 = new Map(
      (allPlayers2 as PlayerColor[]).map((p) => [p.userId, p.civName])
    );

    return widget({
      props: {
        view: "events",
        events: {
          events: (events as EventResult[]).map((e) => ({
            tickNumber: e.tickNumber,
            type: e.type,
            actorCivName: playerMap2.get(e.actorId) ?? "Unknown",
            targetCivName: e.targetId ? (playerMap2.get(e.targetId) ?? "Unknown") : null,
            q: e.q,
            r: e.r,
            outcome: e.outcome,
            narrative: e.narrative,
            timestamp: e.timestamp,
          })),
          currentPlayerCivName: player!.civName,
        },
      },
      output: text(`${args.diplomacyType} dispatched to ${targetPlayer.civName}. AP remaining: ${remaining}. Resolves at next tick.`),
    });
  }
);

server.listen().then(() => {
  console.log("Civilization Strategy Server running");
});
