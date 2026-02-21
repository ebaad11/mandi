import { internalMutation } from "./_generated/server";
import { hexesInRadius } from "./tiles";

export const resolveTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Get current tick number
    const lastTick = await ctx.db
      .query("ticks")
      .order("desc")
      .first();
    const tickNumber = lastTick ? lastTick.tickNumber + 1 : 1;

    // 2. Fetch all queued actions (sorted by type priority)
    const ACTION_ORDER = ["defend", "found", "move", "scout", "invest", "attack", "diplomacy"];
    const allActions = await ctx.db
      .query("pendingActions")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();

    const sortedActions = [...allActions].sort(
      (a, b) =>
        (ACTION_ORDER.indexOf(a.type) === -1 ? 99 : ACTION_ORDER.indexOf(a.type)) -
        (ACTION_ORDER.indexOf(b.type) === -1 ? 99 : ACTION_ORDER.indexOf(b.type))
    );

    let actionsProcessed = 0;

    for (const action of sortedActions) {
      const unit = action.unitId ? await ctx.db.get(action.unitId) : null;
      if (unit && unit.status === "dead") {
        await ctx.db.patch(action._id, { status: "cancelled" });
        continue;
      }

      const player = await ctx.db
        .query("players")
        .withIndex("by_userId", (q) => q.eq("userId", action.playerId))
        .first();
      if (!player || player.status === "defeated") {
        await ctx.db.patch(action._id, { status: "cancelled" });
        continue;
      }

      // 3. Process by type
      if (action.type === "defend" && unit) {
        // Fortify unit
        await ctx.db.patch(unit._id, { status: "fortified" });

        // Fortify tile
        const tile = await ctx.db
          .query("tiles")
          .withIndex("by_q_r", (q) => q.eq("q", unit.q).eq("r", unit.r))
          .first();
        if (tile) {
          const updates: Record<string, unknown> = { fortifiedBy: unit._id };
          if (!tile.ownerId) {
            updates.ownerId = action.playerId;
          }
          await ctx.db.patch(tile._id, updates);
        }

        await ctx.db.insert("events", {
          tickNumber,
          type: "fortify",
          actorId: action.playerId,
          targetId: null,
          q: unit.q,
          r: unit.r,
          outcome: "success",
          narrative: `${player.leaderName}'s forces have fortified at (${unit.q}, ${unit.r}), establishing a defensive position.`,
          timestamp: Date.now(),
        });

      } else if (action.type === "found" && unit) {
        const tile = await ctx.db
          .query("tiles")
          .withIndex("by_q_r", (q) => q.eq("q", action.targetQ).eq("r", action.targetR))
          .first();

        if (tile && !tile.ownerId) {
          await ctx.db.patch(tile._id, {
            ownerId: action.playerId,
            improvement: "settlement",
            resourceRevealed: true,
          });

          await ctx.db.insert("events", {
            tickNumber,
            type: "found",
            actorId: action.playerId,
            targetId: null,
            q: action.targetQ,
            r: action.targetR,
            outcome: "success",
            narrative: `${player.civName} has founded a settlement at (${action.targetQ}, ${action.targetR}), extending their dominion.`,
            timestamp: Date.now(),
          });
        }

      } else if (action.type === "move" && unit) {
        await ctx.db.patch(unit._id, {
          q: action.targetQ,
          r: action.targetR,
          status: "idle",
        });

        // Reveal tiles in radius 1 around new position
        const revealHexes = hexesInRadius(action.targetQ, action.targetR, 1);
        for (const { q, r } of revealHexes) {
          const tile = await ctx.db
            .query("tiles")
            .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
            .first();
          if (tile && !tile.discoveredBy.includes(action.playerId)) {
            await ctx.db.patch(tile._id, {
              discoveredBy: [...tile.discoveredBy, action.playerId],
            });
          }
        }

        await ctx.db.insert("events", {
          tickNumber,
          type: "move",
          actorId: action.playerId,
          targetId: null,
          q: action.targetQ,
          r: action.targetR,
          outcome: "success",
          narrative: `${player.leaderName}'s unit moved to (${action.targetQ}, ${action.targetR}).`,
          timestamp: Date.now(),
        });

      } else if (action.type === "scout" && unit) {
        // Reveal tiles in radius 2
        const revealHexes = hexesInRadius(unit.q, unit.r, 2);
        for (const { q, r } of revealHexes) {
          const tile = await ctx.db
            .query("tiles")
            .withIndex("by_q_r", (qb) => qb.eq("q", q).eq("r", r))
            .first();
          if (tile) {
            const updates: Record<string, unknown> = {};
            if (!tile.discoveredBy.includes(action.playerId)) {
              updates.discoveredBy = [...tile.discoveredBy, action.playerId];
            }
            // Reveal resources on owned tiles
            if (tile.ownerId === action.playerId && !tile.surveyedBy.includes(action.playerId)) {
              updates.surveyedBy = [...(tile.surveyedBy || []), action.playerId];
              updates.resourceRevealed = true;
            }
            if (Object.keys(updates).length > 0) {
              await ctx.db.patch(tile._id, updates);
            }
          }
        }

        await ctx.db.insert("events", {
          tickNumber,
          type: "scout",
          actorId: action.playerId,
          targetId: null,
          q: unit.q,
          r: unit.r,
          outcome: "success",
          narrative: `${player.leaderName}'s scouts surveyed the surrounding lands, revealing terrain and resources.`,
          timestamp: Date.now(),
        });

      } else if (action.type === "invest" && unit) {
        const tile = await ctx.db
          .query("tiles")
          .withIndex("by_q_r", (q) => q.eq("q", action.targetQ).eq("r", action.targetR))
          .first();

        if (tile && tile.ownerId === action.playerId) {
          let newImprovement = tile.improvement;
          if (tile.terrain === "plains" || tile.terrain === "river" || tile.terrain === "forest") {
            newImprovement = "farm";
          } else if (tile.terrain === "mountain" || tile.terrain === "desert") {
            newImprovement = "mine";
          }

          if (newImprovement !== tile.improvement) {
            await ctx.db.patch(tile._id, { improvement: newImprovement });

            await ctx.db.insert("events", {
              tickNumber,
              type: "invest",
              actorId: action.playerId,
              targetId: null,
              q: action.targetQ,
              r: action.targetR,
              outcome: "success",
              narrative: `${player.civName} built a ${newImprovement} at (${action.targetQ}, ${action.targetR}), improving resource yields.`,
              timestamp: Date.now(),
            });
          }
        }

      } else if (action.type === "attack" && unit) {
        // Get defender units at target hex
        const defenders = await ctx.db
          .query("units")
          .withIndex("by_q_r", (q) => q.eq("q", action.targetQ).eq("r", action.targetR))
          .filter((q) => q.neq(q.field("status"), "dead"))
          .collect();

        const enemyDefenders = defenders.filter((d) => d.ownerId !== action.playerId);

        if (enemyDefenders.length === 0) {
          await ctx.db.insert("events", {
            tickNumber,
            type: "attack",
            actorId: action.playerId,
            targetId: null,
            q: action.targetQ,
            r: action.targetR,
            outcome: "no_target",
            narrative: `${player.leaderName}'s forces attacked (${action.targetQ}, ${action.targetR}) but found no enemy.`,
            timestamp: Date.now(),
          });
        } else {
          const defender = enemyDefenders[0];
          const defenderPlayer = await ctx.db
            .query("players")
            .withIndex("by_userId", (q) => q.eq("userId", defender.ownerId))
            .first();

          const targetTile = await ctx.db
            .query("tiles")
            .withIndex("by_q_r", (q) => q.eq("q", action.targetQ).eq("r", action.targetR))
            .first();

          // Combat resolution
          const fortressBonus = targetTile?.improvement === "fortress" ? 2 : 0;
          const fortifyBonus = defender.status === "fortified" ? 2 : 0;
          const attackerATK = unit.atk;
          const defenderDEF = defender.def + fortifyBonus + fortressBonus;

          const damageToDefender = Math.max(1, attackerATK - defenderDEF);
          const damageToAttacker = Math.max(0, defenderDEF - attackerATK);

          // Apply damage to defender
          const newDefenderHp = defender.hp - damageToDefender;
          const defenderDied = newDefenderHp <= 0;
          await ctx.db.patch(defender._id, {
            hp: Math.max(0, newDefenderHp),
            status: defenderDied ? "dead" : defender.status,
          });

          // Counter damage to attacker
          if (damageToAttacker > 0) {
            const newAttackerHp = unit.hp - damageToAttacker;
            await ctx.db.patch(unit._id, {
              hp: Math.max(0, newAttackerHp),
              status: newAttackerHp <= 0 ? "dead" : unit.status,
            });
          }

          // If defender died and tile was fortified by them, clear it
          if (defenderDied && targetTile && targetTile.fortifiedBy === defender._id) {
            // Check if any other friendly defenders remain
            const remainingDefenders = enemyDefenders.filter(
              (d) => d._id !== defender._id
            );
            if (remainingDefenders.length === 0) {
              await ctx.db.patch(targetTile._id, {
                fortifiedBy: null,
                ownerId: null,
              });
            }
          }

          const outcome = defenderDied ? "defender_killed" : "damage_dealt";
          const defCivName = defenderPlayer?.civName ?? "Unknown Civilization";

          await ctx.db.insert("events", {
            tickNumber,
            type: "attack",
            actorId: action.playerId,
            targetId: defender.ownerId,
            q: action.targetQ,
            r: action.targetR,
            outcome,
            narrative: defenderDied
              ? `${player.civName} struck down a ${defCivName} ${defender.type} at (${action.targetQ}, ${action.targetR})! The field is won.`
              : `${player.civName} attacked ${defCivName} at (${action.targetQ}, ${action.targetR}). The ${defender.type} stands with ${Math.max(0, newDefenderHp)} HP remaining.`,
            timestamp: Date.now(),
          });
        }

      } else if (action.type === "diplomacy") {
        const targetPlayer = action.targetPlayerId
          ? await ctx.db
              .query("players")
              .withIndex("by_userId", (q) => q.eq("userId", action.targetPlayerId!))
              .first()
          : null;

        await ctx.db.insert("events", {
          tickNumber,
          type: "diplomacy",
          actorId: action.playerId,
          targetId: action.targetPlayerId,
          q: action.targetQ,
          r: action.targetR,
          outcome: action.diplomacyType ?? "proposal",
          narrative: `${player.civName} extended a diplomatic ${action.diplomacyType ?? "gesture"} to ${targetPlayer?.civName ?? "the world"}.`,
          timestamp: Date.now(),
        });
      }

      // Mark action as resolved
      await ctx.db.patch(action._id, { status: "resolved" });
      actionsProcessed++;
    }

    // 10. Distribute resource yields to all players based on owned tiles
    const allOwnedTiles = await ctx.db.query("tiles").collect();
    const yieldsByPlayer: Record<string, { grain: number; stone: number; gold: number; knowledge: number }> = {};

    for (const tile of allOwnedTiles) {
      if (!tile.ownerId) continue;
      if (!yieldsByPlayer[tile.ownerId]) {
        yieldsByPlayer[tile.ownerId] = { grain: 0, stone: 0, gold: 0, knowledge: 0 };
      }
      const y = tile.baseYield;
      // Farm bonus
      const farmBonus = tile.improvement === "farm" ? 2 : 0;
      // Mine bonus
      const mineBonus = tile.improvement === "mine" ? 2 : 0;

      yieldsByPlayer[tile.ownerId].grain += y.grain + (tile.terrain !== "mountain" ? farmBonus : 0);
      yieldsByPlayer[tile.ownerId].stone += y.stone + (tile.terrain === "mountain" || tile.terrain === "desert" ? mineBonus : 0);
      yieldsByPlayer[tile.ownerId].gold += y.gold;
      yieldsByPlayer[tile.ownerId].knowledge += y.knowledge;

      // Hidden resource bonus
      if (tile.resourceRevealed && tile.hiddenResource && tile.hiddenAmount > 0) {
        yieldsByPlayer[tile.ownerId][tile.hiddenResource as keyof typeof yieldsByPlayer[string]] += tile.hiddenAmount;
      }
    }

    for (const [userId, delta] of Object.entries(yieldsByPlayer)) {
      const player = await ctx.db
        .query("players")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (player && player.status !== "defeated") {
        await ctx.db.patch(player._id, {
          grain: Math.max(0, player.grain + delta.grain),
          stone: Math.max(0, player.stone + delta.stone),
          gold: Math.max(0, player.gold + delta.gold),
          knowledge: Math.max(0, player.knowledge + delta.knowledge),
        });
      }
    }

    // 12. Update advisor moods based on recent outcomes
    const activePlayers = await ctx.db
      .query("players")
      .filter((q) => q.neq(q.field("status"), "defeated"))
      .collect();

    for (const player of activePlayers) {
      const advisor = await ctx.db
        .query("advisors")
        .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
        .first();
      if (!advisor) continue;

      const recentEvents = await ctx.db
        .query("events")
        .withIndex("by_actorId", (q) => q.eq("actorId", player.userId))
        .order("desc")
        .take(5);

      const hasVictory = recentEvents.some((e) => e.outcome === "defender_killed");
      const hasLoss = recentEvents.some((e) => e.type === "attack" && e.targetId === player.userId && e.outcome === "defender_killed");

      let newMood: "confident" | "worried" | "desperate" | "triumphant" | "suspicious" | "mourning" = advisor.mood;
      if (hasVictory) newMood = "triumphant";
      else if (hasLoss) newMood = "mourning";
      else if (player.actionPoints < 3) newMood = "worried";
      else newMood = "confident";

      if (newMood !== advisor.mood) {
        const systemPrompt = `You are ${advisor.name}, ${advisor.title}. Archetype: ${advisor.archetype}.
Personality: aggression=${advisor.aggression}/10, caution=${advisor.caution}/10, mysticism=${advisor.mysticism}/10.
Speech: ${advisor.speechStyle}. Catchphrase: '${advisor.catchphrase}'.
Strategy: ${advisor.favoredStrategy}. Background: ${advisor.backstory}.
Current mood: ${newMood}. Stay in character always.`;
        await ctx.db.patch(advisor._id, { mood: newMood, systemPrompt });
      }
    }

    // 13. Insert tick record
    await ctx.db.insert("ticks", {
      tickNumber,
      resolvedAt: Date.now(),
      actionsProcessed,
    });
  },
});

export const resetAllAP = internalMutation({
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
