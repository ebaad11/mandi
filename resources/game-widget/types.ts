import { z } from "zod";

// --- Props Schema ---
export const propsSchema = z.object({
  view: z.enum(["onboarding", "map", "profile", "events"]),

  onboarding: z
    .object({
      errorMessage: z.string().optional(),
    })
    .optional(),

  map: z
    .object({
      tiles: z.array(
        z.object({
          q: z.number(),
          r: z.number(),
          terrain: z.string(),
          improvement: z.string(),
          ownerId: z.string().nullable(),
          ownerColor: z.string().nullable(),
          isBorder: z.boolean(),
          isVisible: z.boolean(),
          units: z.array(
            z.object({
              id: z.string(),
              type: z.string(),
              ownerColor: z.string(),
              isOwnUnit: z.boolean(),
              name: z.string().optional(),
              hp: z.number().optional(),
              maxHp: z.number().optional(),
              atk: z.number().optional(),
              def: z.number().optional(),
              mov: z.number().optional(),
              status: z.string().optional(),
            })
          ),
        })
      ),
      playerColor: z.string(),
      playerId: z.string(),
      centerQ: z.number(),
      centerR: z.number(),
      pendingActions: z
        .array(
          z.object({
            unitId: z.string(),
            type: z.string(),
            fromQ: z.number(),
            fromR: z.number(),
            targetQ: z.number(),
            targetR: z.number(),
          })
        )
        .optional(),
      playerStats: z
        .object({
          leaderName: z.string(),
          civName: z.string(),
          grain: z.number(),
          stone: z.number(),
          gold: z.number(),
          knowledge: z.number(),
          actionPoints: z.number(),
          maxActionPoints: z.number(),
          apResetsAt: z.number(),
          nextTickAt: z.number(),
          advisor: z
            .object({
              name: z.string(),
              title: z.string(),
              mood: z.string(),
              catchphrase: z.string(),
              loyaltyScore: z.number(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),

  profile: z
    .object({
      player: z.object({
        leaderName: z.string(),
        civName: z.string(),
        civBonus: z.string(),
        color: z.string(),
        grain: z.number(),
        stone: z.number(),
        gold: z.number(),
        knowledge: z.number(),
        actionPoints: z.number(),
        maxActionPoints: z.number(),
        apResetsAt: z.number(),
        nextTickAt: z.number(),
      }),
      advisor: z.object({
        name: z.string(),
        title: z.string(),
        mood: z.string(),
        catchphrase: z.string(),
        loyaltyScore: z.number(),
      }),
      units: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          hp: z.number(),
          maxHp: z.number(),
          status: z.string(),
          q: z.number(),
          r: z.number(),
        })
      ),
      queuedActionsCount: z.number(),
      territoryCount: z.number(),
    })
    .optional(),

  events: z
    .object({
      events: z.array(
        z.object({
          tickNumber: z.number(),
          type: z.string(),
          actorCivName: z.string(),
          targetCivName: z.string().nullable(),
          q: z.number(),
          r: z.number(),
          outcome: z.string(),
          narrative: z.string(),
          timestamp: z.number(),
        })
      ),
      currentPlayerCivName: z.string(),
    })
    .optional(),
});

export type Props = z.infer<typeof propsSchema>;

// --- Unit on a tile ---
export type UnitOnTile = {
  id: string;
  type: string;
  ownerColor: string;
  isOwnUnit: boolean;
  name?: string;
  hp?: number;
  maxHp?: number;
  atk?: number;
  def?: number;
  mov?: number;
  status?: string;
};

// --- Tile ---
export type TileProps = {
  q: number;
  r: number;
  terrain: string;
  improvement: string;
  ownerId: string | null;
  ownerColor: string | null;
  isBorder: boolean;
  isVisible: boolean;
  units: UnitOnTile[];
};

// --- Pending action (ghost rendering) ---
export type PendingAction = {
  unitId: string;
  type: string;
  fromQ: number;
  fromR: number;
  targetQ: number;
  targetR: number;
};

// --- Interaction state machine ---
export type ActionMode = "move" | "attack" | "defend" | "scout" | "found" | "invest";
export type InteractionPhase = "IDLE" | "UNIT_SELECTED" | "TARGETING" | "CONFIRMING" | "SUBMITTING";

export type InteractionState = {
  phase: InteractionPhase;
  selectedUnit: UnitOnTile | null;
  selectedUnitHex: { q: number; r: number } | null;
  actionMode: ActionMode | null;
  targetHex: { q: number; r: number } | null;
};

export const INITIAL_INTERACTION: InteractionState = {
  phase: "IDLE",
  selectedUnit: null,
  selectedUnitHex: null,
  actionMode: null,
  targetHex: null,
};

// --- Event item ---
export type EventItem = {
  tickNumber: number;
  type: string;
  actorCivName: string;
  targetCivName: string | null;
  q: number;
  r: number;
  outcome: string;
  narrative: string;
  timestamp: number;
};
