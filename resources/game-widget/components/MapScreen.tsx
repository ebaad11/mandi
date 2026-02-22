import { useState, useEffect, useCallback } from "react";
import { useCallTool, useWidget } from "mcp-use/react";
import type { Props, TileProps, PendingAction, ActionMode, InteractionState, UnitOnTile } from "../types";
import { INITIAL_INTERACTION } from "../types";
import {
  TERRAIN_COLORS, TERRAIN_WALL, UNIT_EMOJI, MOOD_COLOR,
  AP_COSTS, ACTION_LABELS,
} from "../constants";
import {
  hexToPixel, pointyHexCorners, cornersToPath, wallPath, HEX_SIZE, HEX_DIRS,
  getReachableHexes, getAttackableHexes,
} from "../hex-utils";
import { GhostOverlays } from "./GhostOverlays";
import { EventsPanel } from "./EventsPanel";
import { ProfilePanel } from "./ProfilePanel";

export function MapScreen({
  mapData,
  profileData,
  eventsData,
  openPanel,
  setOpenPanel,
  isLoading,
}: {
  mapData: NonNullable<Props["map"]>;
  profileData: Props["profile"] | null;
  eventsData: Props["events"] | null;
  openPanel: "profile" | "events" | null;
  setOpenPanel: (panel: "profile" | "events" | null) => void;
  isLoading: boolean;
}) {
  const [selectedHex, setSelectedHex] = useState<TileProps | null>(null);
  const [countdown, setCountdown] = useState("");
  const [tickCountdown, setTickCountdown] = useState("");
  const [zoom, setZoom] = useState(1);

  // --- Interaction state ---
  const [interaction, setInteraction] = useState<InteractionState>(INITIAL_INTERACTION);
  const [localPendingActions, setLocalPendingActions] = useState<PendingAction[]>([]);
  const [localAPOffset, setLocalAPOffset] = useState(0); // optimistic AP deductions
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // useCallTool hooks — one per tool
  const { callToolAsync: callMove } = useCallTool("move");
  const { callToolAsync: callAttack } = useCallTool("attack");
  const { callToolAsync: callDefend } = useCallTool("defend");
  const { callToolAsync: callScout } = useCallTool("scout");
  const { callToolAsync: callFound } = useCallTool("found");
  const { callToolAsync: callInvest } = useCallTool("invest");

  const { sendFollowUpMessage } = useWidget<Props>();

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  // Sync server pending actions and reset local optimistic state when new data arrives
  useEffect(() => {
    setLocalPendingActions([]);
    setLocalAPOffset(0);
  }, [mapData.pendingActions]);

  useEffect(() => {
    if (!mapData.playerStats) return;
    function update() {
      const diff = mapData.playerStats!.apResetsAt - Date.now();
      if (diff <= 0) {
        setCountdown("Resetting...");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [mapData.playerStats?.apResetsAt]);

  useEffect(() => {
    if (!mapData.playerStats?.nextTickAt) return;
    function update() {
      const diff = mapData.playerStats!.nextTickAt - Date.now();
      if (diff <= 0) {
        setTickCountdown("Resolving...");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTickCountdown(`${m}m ${s.toString().padStart(2, "0")}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [mapData.playerStats?.nextTickAt]);

  // Auto-dismiss error toast
  useEffect(() => {
    if (!errorMessage) return;
    const id = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(id);
  }, [errorMessage]);

  const SVG_W = 560;
  const SVG_H = 420;
  const offsetX = SVG_W / 2;
  const offsetY = SVG_H / 2;
  const stats = mapData.playerStats;
  const serverAP = stats?.actionPoints ?? 0;
  const effectiveAP = serverAP - localAPOffset;

  const barStyle: React.CSSProperties = {
    height: 40,
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    gap: 16,
    background: "rgba(20, 14, 6, 0.97)",
    fontSize: 13,
    color: "#c8b880",
    fontFamily: "'Cinzel', Georgia, serif",
    flexShrink: 0,
  };

  // Merge server + local optimistic pending actions
  const serverPending: PendingAction[] = mapData.pendingActions ?? [];
  const allPendingActions = [...serverPending, ...localPendingActions];

  // --- Cancel interaction ---
  const cancelInteraction = useCallback(() => {
    setInteraction(INITIAL_INTERACTION);
  }, []);

  // --- Compute reachable/attackable hexes for targeting ---
  const targetableHexes: Set<string> | null = (() => {
    if (interaction.phase !== "TARGETING" || !interaction.selectedUnitHex || !interaction.actionMode) return null;
    const { q, r } = interaction.selectedUnitHex;
    if (interaction.actionMode === "move") {
      const mov = interaction.selectedUnit?.mov ?? 2;
      return getReachableHexes(q, r, mov, mapData.tiles);
    }
    if (interaction.actionMode === "attack") {
      return getAttackableHexes(q, r, mapData.tiles);
    }
    return null;
  })();

  // --- Build preview ghost for CONFIRMING phase ---
  const previewAction: PendingAction | null = (() => {
    if (interaction.phase !== "CONFIRMING" || !interaction.selectedUnit || !interaction.selectedUnitHex || !interaction.actionMode) return null;
    const { q: fromQ, r: fromR } = interaction.selectedUnitHex;
    const tq = interaction.targetHex?.q ?? fromQ;
    const tr = interaction.targetHex?.r ?? fromR;
    return {
      unitId: interaction.selectedUnit.id,
      type: interaction.actionMode,
      fromQ, fromR,
      targetQ: tq, targetR: tr,
    };
  })();

  // --- Hex click handler (phase-aware) ---
  const handleHexClick = useCallback((tile: TileProps) => {
    const { phase } = interaction;

    if (phase === "SUBMITTING") return;

    if (phase === "TARGETING") {
      const key = `${tile.q},${tile.r}`;
      if (targetableHexes?.has(key)) {
        // Move to CONFIRMING
        setInteraction((prev) => ({ ...prev, phase: "CONFIRMING", targetHex: { q: tile.q, r: tile.r } }));
      } else {
        // Clicked outside range — cancel
        cancelInteraction();
      }
      return;
    }

    if (phase === "CONFIRMING") {
      // Clicks ignored in CONFIRMING (use buttons)
      return;
    }

    // IDLE or UNIT_SELECTED
    const ownUnits = tile.units.filter((u) => u.isOwnUnit);
    if (ownUnits.length > 0) {
      // Select first own unit
      const unit = ownUnits[0];
      setInteraction({
        phase: "UNIT_SELECTED",
        selectedUnit: unit,
        selectedUnitHex: { q: tile.q, r: tile.r },
        actionMode: null,
        targetHex: null,
      });
      setSelectedHex(tile);
      return;
    }

    // Clicked empty or enemy tile — back to IDLE
    if (phase === "UNIT_SELECTED") {
      cancelInteraction();
    }
    // In IDLE, toggle hex detail as before
    setSelectedHex((prev) => (prev?.q === tile.q && prev?.r === tile.r ? null : tile));
  }, [interaction, targetableHexes, cancelInteraction]);

  // --- Action button handler ---
  const handleActionButton = useCallback((action: ActionMode) => {
    // Actions that don't need targeting (defend, scout on current tile, found/invest on current tile)
    const noTargetActions: ActionMode[] = ["defend", "scout"];
    if (noTargetActions.includes(action)) {
      setInteraction((prev) => ({
        ...prev,
        phase: "CONFIRMING",
        actionMode: action,
        targetHex: prev.selectedUnitHex,
      }));
      return;
    }

    // found/invest can target current tile too — go straight to confirming
    if (action === "found" || action === "invest") {
      setInteraction((prev) => ({
        ...prev,
        phase: "CONFIRMING",
        actionMode: action,
        targetHex: prev.selectedUnitHex,
      }));
      return;
    }

    // move/attack need targeting
    setInteraction((prev) => ({
      ...prev,
      phase: "TARGETING",
      actionMode: action,
      targetHex: null,
    }));
  }, []);

  // --- Confirm handler with optimistic updates ---
  const handleConfirm = useCallback(async () => {
    const { selectedUnit, selectedUnitHex, actionMode, targetHex } = interaction;
    if (!selectedUnit || !selectedUnitHex || !actionMode) return;

    const cost = AP_COSTS[actionMode];
    const tq = targetHex?.q ?? selectedUnitHex.q;
    const tr = targetHex?.r ?? selectedUnitHex.r;

    // Build optimistic pending action
    const optimisticAction: PendingAction = {
      unitId: selectedUnit.id,
      type: actionMode,
      fromQ: selectedUnitHex.q,
      fromR: selectedUnitHex.r,
      targetQ: tq,
      targetR: tr,
    };

    // Optimistic update
    setLocalPendingActions((prev) => [...prev, optimisticAction]);
    setLocalAPOffset((prev) => prev + cost);
    setInteraction(INITIAL_INTERACTION);
    setSelectedHex(null);

    try {
      // Call the appropriate tool (cast needed — auto-generated types not available yet)
      if (actionMode === "move") {
        await callMove({ unitId: selectedUnit.id, targetQ: tq, targetR: tr } as any);
      } else if (actionMode === "attack") {
        await callAttack({ unitId: selectedUnit.id, targetQ: tq, targetR: tr } as any);
      } else if (actionMode === "defend") {
        await callDefend({ unitId: selectedUnit.id } as any);
      } else if (actionMode === "scout") {
        await callScout({ unitId: selectedUnit.id } as any);
      } else if (actionMode === "found") {
        await callFound({ unitId: selectedUnit.id, targetQ: tq, targetR: tr } as any);
      } else if (actionMode === "invest") {
        await callInvest({ unitId: selectedUnit.id, targetQ: tq, targetR: tr } as any);
      }

      // Notify AI advisor — include unit type and coordinates for reliable identification
      const unitLabel = selectedUnit.name
        ? `${selectedUnit.name} (${selectedUnit.type} at ${selectedUnitHex.q},${selectedUnitHex.r})`
        : `my ${selectedUnit.type} at (${selectedUnitHex.q}, ${selectedUnitHex.r})`;
      const actionLabel = ACTION_LABELS[actionMode].label.toLowerCase();
      const msg = actionMode === "move" || actionMode === "attack"
        ? `I ordered ${unitLabel} to ${actionLabel} to (${tq}, ${tr}).`
        : `I ordered ${unitLabel} to ${actionLabel}.`;
      sendFollowUpMessage(msg);
    } catch (err: any) {
      // Revert optimistic updates
      setLocalPendingActions((prev) => prev.filter((a) => a !== optimisticAction));
      setLocalAPOffset((prev) => prev - cost);
      const errMsg = err?.message ?? "Action failed";
      setErrorMessage(errMsg);
    }
  }, [interaction, callMove, callAttack, callDefend, callScout, callFound, callInvest, sendFollowUpMessage]);

  // --- Unit picker for multi-unit hexes ---
  const ownUnitsOnSelectedHex = selectedHex?.units.filter((u) => u.isOwnUnit) ?? [];
  const showUnitPicker = interaction.phase === "UNIT_SELECTED" && ownUnitsOnSelectedHex.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#0d0d0d" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');
        @keyframes loading-bar {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes ghost-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes arrow-grow {
          0% { stroke-dashoffset: 60; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes arrow-march {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -16; }
        }
        @keyframes ghost-bob {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-3px); opacity: 0.9; }
        }
        @keyframes range-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.35; }
        }
      `}</style>

      {/* Thin loading bar when tool is running but map is already loaded */}
      {isLoading && (
        <div
          style={{
            height: 2,
            background: "linear-gradient(90deg, #3a2a10, #d4a017, #3a2a10)",
            backgroundSize: "200% 100%",
            animation: "loading-bar 1.2s linear infinite",
            flexShrink: 0,
          }}
        />
      )}

      {/* Top bar — resources + AP + events toggle */}
      <div style={{ ...barStyle, borderBottom: "1px solid #2a1a08" }}>
        {stats ? (
          <>
            <span title="Grain">🌾 {stats.grain}</span>
            <span title="Stone">🪨 {stats.stone}</span>
            <span title="Gold">💰 {stats.gold}</span>
            <span title="Knowledge">📜 {stats.knowledge}</span>
            <span style={{ marginLeft: "auto", color: localAPOffset > 0 ? "#e9c46a" : "#d4a017", fontWeight: "bold" }}>
              AP {effectiveAP}/{stats.maxActionPoints}
            </span>
            {countdown && (
              <span style={{ color: "#665540", fontSize: 11 }}>⏱ {countdown}</span>
            )}
            {tickCountdown && (
              <span style={{ color: "#665540", fontSize: 11 }}>⚔ {tickCountdown}</span>
            )}
          </>
        ) : (
          <span style={{ color: "#444", marginRight: "auto" }}>—</span>
        )}

        {/* Events toggle button */}
        <button
          onClick={() => setOpenPanel(openPanel === "events" ? null : "events")}
          style={{
            marginLeft: stats ? 8 : "auto",
            background: openPanel === "events" ? "rgba(212, 160, 23, 0.2)" : "none",
            border: openPanel === "events" ? "1px solid #d4a017" : "1px solid #3a2a10",
            borderRadius: 4,
            color: openPanel === "events" ? "#d4a017" : "#665540",
            cursor: "pointer",
            fontSize: 14,
            padding: "2px 8px",
            fontFamily: "'Cinzel', Georgia, serif",
          }}
          title="Toggle dispatches"
        >
          📜
        </button>
      </div>

      {/* Mode banner for TARGETING / CONFIRMING */}
      {(interaction.phase === "TARGETING" || interaction.phase === "CONFIRMING") && interaction.actionMode && (
        <div
          style={{
            ...barStyle,
            height: 32,
            fontSize: 12,
            borderBottom: "1px solid #3a2a10",
            background: "rgba(30, 20, 8, 0.97)",
            gap: 8,
          }}
        >
          <span style={{ color: "#d4a017" }}>
            {ACTION_LABELS[interaction.actionMode].emoji} {interaction.phase === "TARGETING" ? "SELECT TARGET" : "CONFIRM"} — {interaction.selectedUnit?.name ?? interaction.selectedUnit?.type}
          </span>
          {interaction.phase === "CONFIRMING" && interaction.targetHex && (
            <span style={{ color: "#a08050" }}>
              → ({interaction.targetHex.q}, {interaction.targetHex.r})
            </span>
          )}
          <button
            onClick={cancelInteraction}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid #665540",
              borderRadius: 3,
              color: "#665540",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 8px",
              fontFamily: "'Cinzel', Georgia, serif",
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}

      {/* Map area — SVG + overlays + panels */}
      <div style={{ position: "relative" }}>
        {/* Error toast */}
        {errorMessage && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              background: "rgba(230, 57, 70, 0.9)",
              border: "1px solid #e63946",
              borderRadius: 4,
              padding: "6px 16px",
              fontSize: 12,
              color: "#fff",
              fontFamily: "'Cinzel', Georgia, serif",
              whiteSpace: "nowrap",
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Pending actions badge */}
        {allPendingActions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: errorMessage ? 38 : 8,
              left: 8,
              zIndex: 10,
              background: "rgba(212, 160, 23, 0.12)",
              border: "1px solid #d4a017",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 11,
              color: "#d4a017",
              pointerEvents: "none",
            }}
          >
            {allPendingActions.length} action{allPendingActions.length > 1 ? "s" : ""} pending{tickCountdown ? ` — resolves in ${tickCountdown}` : ""}
          </div>
        )}

        {/* Selected hex detail panel (with unit stats + unit picker) */}
        {interaction.phase === "UNIT_SELECTED" && interaction.selectedUnit && selectedHex && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: openPanel === "events" ? 268 : 8,
              zIndex: 10,
              background: "rgba(20, 14, 6, 0.93)",
              border: "1px solid #8b6914",
              borderRadius: 4,
              padding: "10px 12px",
              fontSize: 12,
              color: "#e8d5a3",
              minWidth: 140,
              fontFamily: "'Cinzel', Georgia, serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: "#d4a017", fontWeight: "bold", marginBottom: 4 }}>
              {UNIT_EMOJI[interaction.selectedUnit.type] ?? "●"} {interaction.selectedUnit.name ?? interaction.selectedUnit.type}
            </div>
            {interaction.selectedUnit.hp != null && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#a08050", marginBottom: 2 }}>
                  <span>HP {interaction.selectedUnit.hp}/{interaction.selectedUnit.maxHp}</span>
                </div>
                <div style={{ height: 4, background: "#1a1208", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((interaction.selectedUnit.hp ?? 0) / (interaction.selectedUnit.maxHp ?? 1)) * 100}%`, background: ((interaction.selectedUnit.hp ?? 0) / (interaction.selectedUnit.maxHp ?? 1)) > 0.5 ? "#2a9d8f" : "#e9c46a" }} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#a08050", marginBottom: 2 }}>
              {interaction.selectedUnit.atk != null && <span>ATK {interaction.selectedUnit.atk}</span>}
              {interaction.selectedUnit.def != null && <span>DEF {interaction.selectedUnit.def}</span>}
              {interaction.selectedUnit.mov != null && <span>MOV {interaction.selectedUnit.mov}</span>}
            </div>
            {interaction.selectedUnit.status && (
              <div style={{ fontSize: 10, color: "#665540", fontStyle: "italic" }}>{interaction.selectedUnit.status}</div>
            )}

            {/* Multi-unit picker */}
            {showUnitPicker && (
              <div style={{ marginTop: 8, borderTop: "1px solid #3a2a10", paddingTop: 6 }}>
                <div style={{ fontSize: 10, color: "#665540", marginBottom: 4 }}>Other units here:</div>
                {ownUnitsOnSelectedHex.filter((u) => u.id !== interaction.selectedUnit?.id).map((u) => (
                  <div
                    key={u.id}
                    onClick={() => setInteraction((prev) => ({ ...prev, selectedUnit: u }))}
                    style={{
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: 2,
                      fontSize: 11,
                      color: "#c8b880",
                      background: "rgba(255,255,255,0.05)",
                      marginBottom: 2,
                    }}
                  >
                    {UNIT_EMOJI[u.type] ?? "●"} {u.name ?? u.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Normal hex detail (IDLE only, no own unit selected) */}
        {interaction.phase === "IDLE" && selectedHex && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: openPanel === "events" ? 268 : 8,
              zIndex: 10,
              background: "rgba(20, 14, 6, 0.93)",
              border: "1px solid #8b6914",
              borderRadius: 4,
              padding: "10px 12px",
              fontSize: 12,
              color: "#e8d5a3",
              minWidth: 140,
              fontFamily: "'Cinzel', Georgia, serif",
            }}
          >
            <div style={{ color: "#d4a017", fontWeight: "bold", marginBottom: 6 }}>
              ({selectedHex.q}, {selectedHex.r})
            </div>
            {selectedHex.isVisible ? (
              <>
                <div>🌍 {selectedHex.terrain}</div>
                {selectedHex.improvement !== "none" && (
                  <div>🔨 {selectedHex.improvement}</div>
                )}
                {selectedHex.ownerId && (
                  <div style={{ color: selectedHex.ownerColor ?? "#fff" }}>◆ Claimed</div>
                )}
                {selectedHex.isBorder && (
                  <div style={{ color: selectedHex.ownerColor ?? "#fff" }}>🏰 Border</div>
                )}
                {selectedHex.units.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: "#a08050", marginBottom: 2 }}>Units:</div>
                    {selectedHex.units.map((u) => (
                      <div key={u.id} style={{ color: u.ownerColor }}>
                        {UNIT_EMOJI[u.type] ?? "●"} {u.type}
                        {u.isOwnUnit ? " ✓" : ""}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#555", fontStyle: "italic" }}>Fog of war</div>
            )}
            <div
              onClick={() => setSelectedHex(null)}
              style={{
                marginTop: 8,
                fontSize: 10,
                color: "#665540",
                cursor: "pointer",
                textAlign: "right",
              }}
            >
              ✕ close
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: openPanel === "events" ? 270 : 10,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {[
            { label: "+", action: () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))) },
            { label: "−", action: () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))) },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: 28,
                height: 28,
                background: "rgba(20, 14, 6, 0.90)",
                border: "1px solid #8b6914",
                borderRadius: 3,
                color: "#d4a017",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                fontFamily: "monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {label}
            </button>
          ))}
          <div
            style={{
              textAlign: "center",
              fontSize: 9,
              color: "#665540",
              fontFamily: "monospace",
              marginTop: 2,
            }}
          >
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Backdrop — click-outside to close panel; sits above SVG but below panels */}
        {openPanel !== null && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 15,
            }}
            onClick={() => setOpenPanel(null)}
          />
        )}

        {/* Events Panel */}
        {openPanel === "events" && (
          <EventsPanel eventsData={eventsData} onClose={() => setOpenPanel(null)} />
        )}

        {/* Profile Panel */}
        {openPanel === "profile" && (
          <ProfilePanel profileData={profileData} onClose={() => setOpenPanel(null)} />
        )}

        <svg
          width="100%"
          height="380"
          viewBox={`${(SVG_W / 2) * (1 - 1 / zoom)} ${(SVG_H / 2) * (1 - 1 / zoom)} ${SVG_W / zoom} ${SVG_H / zoom}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", background: "#0d0d0d" }}
        >
          {/* --- Base terrain tiles --- */}
          {mapData.tiles.map((tile) => {
            const { x, y } = hexToPixel(
              tile.q - mapData.centerQ,
              tile.r - mapData.centerR,
              offsetX,
              offsetY
            );
            const corners = pointyHexCorners(x, y, HEX_SIZE - 1);
            const facePath = cornersToPath(corners);
            const wallP = wallPath(corners, 4);
            const fillColor = TERRAIN_COLORS[tile.terrain] ?? "#555";
            const wallColor = TERRAIN_WALL[tile.terrain] ?? "#333";
            const isSelected = selectedHex?.q === tile.q && selectedHex?.r === tile.r;
            const isSelectedUnit = interaction.selectedUnitHex?.q === tile.q && interaction.selectedUnitHex?.r === tile.r && interaction.phase !== "IDLE";

            // Targeting highlight
            const hexKey = `${tile.q},${tile.r}`;
            const isTargetable = interaction.phase === "TARGETING" && targetableHexes?.has(hexKey);
            const isConfirmTarget = interaction.phase === "CONFIRMING" && interaction.targetHex?.q === tile.q && interaction.targetHex?.r === tile.r;

            return (
              <g
                key={`${tile.q}_${tile.r}`}
                onClick={() => handleHexClick(tile)}
                style={{ cursor: interaction.phase === "CONFIRMING" ? "default" : "pointer" }}
              >
                <path d={wallP} fill={wallColor} />
                <path
                  d={facePath}
                  fill={fillColor}
                  stroke={isSelectedUnit ? "#d4a017" : isSelected ? "#fff" : "#1a1a1a"}
                  strokeWidth={isSelectedUnit ? 2.5 : isSelected ? 2 : 0.5}
                />

                {/* Blue range overlay for targetable hexes */}
                {isTargetable && (
                  <path
                    d={facePath}
                    fill={interaction.actionMode === "attack" ? "rgba(230, 57, 70, 0.25)" : "rgba(74, 154, 255, 0.25)"}
                    stroke={interaction.actionMode === "attack" ? "#e63946" : "#4a9aff"}
                    strokeWidth={1.5}
                    style={{ animation: "range-pulse 1.5s ease-in-out infinite" }}
                  />
                )}

                {/* Confirm target highlight */}
                {isConfirmTarget && (
                  <path
                    d={facePath}
                    fill="rgba(212, 160, 23, 0.3)"
                    stroke="#d4a017"
                    strokeWidth={2}
                  />
                )}

                {tile.isVisible && tile.improvement !== "none" && (
                  <text
                    x={x}
                    y={y - HEX_SIZE * 0.25}
                    textAnchor="middle"
                    fontSize={15}
                    fill="#fff"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {tile.improvement === "settlement"
                      ? "🏛"
                      : tile.improvement === "fortress"
                      ? "🏰"
                      : tile.improvement === "farm"
                      ? "🌾"
                      : "⛏"}
                  </text>
                )}
                {tile.units.slice(0, 3).map((u, i) => (
                  <g key={u.id}>
                    <circle
                      cx={x + (i - 1) * 12}
                      cy={y + HEX_SIZE * 0.2}
                      r={9}
                      fill={u.ownerColor}
                      stroke={u.isOwnUnit ? "#fff" : "#000"}
                      strokeWidth={1.5}
                    />
                    <text
                      x={x + (i - 1) * 12}
                      y={y + HEX_SIZE * 0.2 + 4.5}
                      textAnchor="middle"
                      fontSize={11}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {UNIT_EMOJI[u.type] ?? "●"}
                    </text>
                  </g>
                ))}
                {!tile.isVisible && (
                  <text
                    x={x}
                    y={y + 5}
                    textAnchor="middle"
                    fontSize={14}
                    fill="#555"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    ▓
                  </text>
                )}
              </g>
            );
          })}

          {/* --- Territory overlay: white sheen + thick border on own tiles --- */}
          {(() => {
            const myId = mapData.playerId;
            const ownedSet = new Set<string>();
            for (const t of mapData.tiles) {
              if (t.ownerId === myId && t.isVisible) {
                ownedSet.add(`${t.q},${t.r}`);
              }
            }
            if (ownedSet.size === 0) return null;

            return mapData.tiles
              .filter((t) => ownedSet.has(`${t.q},${t.r}`))
              .map((tile) => {
                const { x, y } = hexToPixel(
                  tile.q - mapData.centerQ,
                  tile.r - mapData.centerR,
                  offsetX,
                  offsetY
                );
                const corners = pointyHexCorners(x, y, HEX_SIZE - 1);
                const facePath = cornersToPath(corners);

                const borderEdges: string[] = [];
                for (let i = 0; i < 6; i++) {
                  const [dq, dr] = HEX_DIRS[i];
                  const nKey = `${tile.q + dq},${tile.r + dr}`;
                  if (!ownedSet.has(nKey)) {
                    const c1 = corners[i];
                    const c2 = corners[(i + 1) % 6];
                    borderEdges.push(
                      `M${c1.x.toFixed(1)},${c1.y.toFixed(1)} L${c2.x.toFixed(1)},${c2.y.toFixed(1)}`
                    );
                  }
                }

                return (
                  <g key={`territory-${tile.q}_${tile.r}`} style={{ pointerEvents: "none" }}>
                    <path d={facePath} fill="rgba(255,255,255,0.15)" />
                    {borderEdges.length > 0 && (
                      <path
                        d={borderEdges.join(" ")}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.85}
                      />
                    )}
                  </g>
                );
              });
          })()}

          {/* Ghost overlays for pending actions */}
          <GhostOverlays actions={allPendingActions} mapData={mapData} offsetX={offsetX} offsetY={offsetY} />

          {/* Preview ghost for CONFIRMING phase */}
          {previewAction && (
            <GhostOverlays actions={[previewAction]} mapData={mapData} offsetX={offsetX} offsetY={offsetY} />
          )}
        </svg>
      </div>

      {/* Action bar — appears when a unit is selected */}
      {interaction.phase === "UNIT_SELECTED" && interaction.selectedUnit && (
        <div
          style={{
            ...barStyle,
            height: "auto",
            padding: "8px 14px",
            borderTop: "1px solid #8b6914",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#d4a017", fontWeight: "bold", fontSize: 12 }}>
              {UNIT_EMOJI[interaction.selectedUnit.type] ?? "●"} {interaction.selectedUnit.name ?? interaction.selectedUnit.type}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <button
                onClick={cancelInteraction}
                style={{
                  background: "none",
                  border: "none",
                  color: "#665540",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 0,
                  fontFamily: "'Cinzel', Georgia, serif",
                }}
              >
                ✕
              </button>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(Object.keys(AP_COSTS) as ActionMode[]).map((action) => {
              const cost = AP_COSTS[action];
              const disabled = effectiveAP < cost;
              const { emoji, label } = ACTION_LABELS[action];
              return (
                <button
                  key={action}
                  onClick={() => !disabled && handleActionButton(action)}
                  disabled={disabled}
                  style={{
                    background: disabled ? "rgba(255,255,255,0.03)" : "rgba(212, 160, 23, 0.12)",
                    border: `1px solid ${disabled ? "#2a1a08" : "#8b6914"}`,
                    borderRadius: 4,
                    color: disabled ? "#444" : "#e8d5a3",
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontSize: 11,
                    padding: "4px 10px",
                    fontFamily: "'Cinzel', Georgia, serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {emoji} {label} {cost}AP
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm bar — appears in CONFIRMING phase */}
      {interaction.phase === "CONFIRMING" && interaction.selectedUnit && interaction.actionMode && (
        <div
          style={{
            ...barStyle,
            height: "auto",
            padding: "10px 14px",
            borderTop: "1px solid #8b6914",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#e8d5a3" }}>
            {ACTION_LABELS[interaction.actionMode].emoji}{" "}
            {ACTION_LABELS[interaction.actionMode].label}{" "}
            {interaction.selectedUnit.name ?? interaction.selectedUnit.type}
            {interaction.targetHex && interaction.targetHex.q !== interaction.selectedUnitHex?.q || interaction.targetHex && interaction.targetHex.r !== interaction.selectedUnitHex?.r
              ? ` to (${interaction.targetHex?.q}, ${interaction.targetHex?.r})`
              : ""}
            ? <span style={{ color: "#d4a017" }}> Cost: {AP_COSTS[interaction.actionMode]} AP</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleConfirm}
              style={{
                background: "linear-gradient(135deg, #8b6914, #d4a017)",
                border: "1px solid #d4a017",
                borderRadius: 4,
                color: "#1a1208",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold",
                padding: "6px 20px",
                fontFamily: "'Cinzel', Georgia, serif",
              }}
            >
              ✓ Confirm {ACTION_LABELS[interaction.actionMode].label}
            </button>
            <button
              onClick={cancelInteraction}
              style={{
                background: "none",
                border: "1px solid #665540",
                borderRadius: 4,
                color: "#665540",
                cursor: "pointer",
                fontSize: 12,
                padding: "6px 16px",
                fontFamily: "'Cinzel', Georgia, serif",
              }}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar — click to open profile panel (hidden when action/confirm bar is showing) */}
      {interaction.phase === "IDLE" && (
        <div
          onClick={() => setOpenPanel(openPanel === "profile" ? null : "profile")}
          style={{
            ...barStyle,
            borderTop: openPanel === "profile" ? "1px solid #8b6914" : "1px solid #2a1a08",
            height: "auto",
            padding: "8px 14px",
            alignItems: "flex-start",
            flexDirection: "row",
            gap: 0,
            cursor: "pointer",
          }}
        >
          {/* Chevron indicator */}
          <span
            style={{
              color: "#665540",
              fontSize: 10,
              marginRight: 8,
              alignSelf: "center",
              display: "inline-block",
              transform: openPanel === "profile" ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          >
            ▲
          </span>

          {stats ? (
            <>
              {/* Left: leader + civ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#d4a017", fontWeight: "bold" }}>{stats.leaderName}</span>
                  <span style={{ color: "#665540" }}>·</span>
                  <span style={{ color: "#a08050" }}>{stats.civName}</span>
                </div>
                {stats.advisor && (
                  <div style={{ fontSize: 11, color: "#665540", fontStyle: "italic" }}>
                    "{stats.advisor.catchphrase}"
                  </div>
                )}
              </div>

              {/* Right: advisor */}
              {stats.advisor && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: MOOD_COLOR[stats.advisor.mood] ?? "#888",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "#c8b880", fontSize: 12 }}>{stats.advisor.name}</span>
                    <span style={{ color: "#665540", fontSize: 11 }}>— {stats.advisor.title}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#665540" }}>
                    {stats.advisor.mood} · loyalty {stats.advisor.loyaltyScore}/100
                  </div>
                </div>
              )}
            </>
          ) : (
            <span style={{ color: "#444" }}>—</span>
          )}
        </div>
      )}
    </div>
  );
}
