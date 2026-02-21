import {
  McpUseProvider,
  useWidget,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";
import { useState, useEffect } from "react";

// --- Props Schema ---

const propsSchema = z.object({
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
            })
          ),
        })
      ),
      playerColor: z.string(),
      centerQ: z.number(),
      centerR: z.number(),
      pendingActionType: z.string().optional(),
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

export const widgetMetadata: WidgetMetadata = {
  description: "Ancient civilization strategy game — Assyrian/Babylonian hex world",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

// --- Colors ---
const TERRAIN_COLORS: Record<string, string> = {
  plains: "#c8a96e",
  desert: "#d4a857",
  mountain: "#8b7355",
  forest: "#5a7a3a",
  river: "#4a7a9b",
  sea: "#2d5a7a",
  fog: "#2a2a2a",
};

const TERRAIN_WALL: Record<string, string> = {
  plains: "#a08040",
  desert: "#b08830",
  mountain: "#5a4a30",
  forest: "#3a5a1a",
  river: "#2a5a7a",
  sea: "#1a3a5a",
  fog: "#1a1a1a",
};

const UNIT_EMOJI: Record<string, string> = {
  spearman: "🗡",
  archer: "🏹",
  cavalry: "🐴",
  siege: "⚙",
  builder: "🔨",
  scout: "👁",
};

const EVENT_ICON: Record<string, string> = {
  attack: "⚔️",
  fortify: "🏰",
  invest: "🔨",
  scout: "👁️",
  diplomacy: "🤝",
  found: "🏛",
  move: "➡️",
  default: "📜",
};

const MOOD_COLOR: Record<string, string> = {
  confident: "#2a9d8f",
  worried: "#e9c46a",
  desperate: "#e63946",
  triumphant: "#f4a261",
  suspicious: "#6a4c93",
  mourning: "#457b9d",
};

// --- Parchment chrome ---
const chromeStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #2a1f0e 0%, #1a1208 100%)",
  border: "2px solid #8b6914",
  borderRadius: 8,
  padding: 16,
  minHeight: 400,
  fontFamily: "'Georgia', 'Times New Roman', serif",
  color: "#e8d5a3",
  position: "relative",
};

const titleBarStyle: React.CSSProperties = {
  borderBottom: "1px solid #8b6914",
  paddingBottom: 8,
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

// --- GameChrome wrapper ---
function GameChrome({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div style={chromeStyle}>
      <div style={titleBarStyle}>
        <span style={{ fontSize: 18, fontWeight: "bold", color: "#d4a017", letterSpacing: 2 }}>
          ⚔ ANCIENT EMPIRES ⚔
        </span>
        {subtitle && (
          <span style={{ fontSize: 12, color: "#a08050", fontStyle: "italic" }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// --- Loading Screen ---
function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 300,
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ color: "#a08050", fontStyle: "italic" }}>
        The scribes prepare the tablets...
      </div>
    </div>
  );
}

// --- Hex math (pointy-top) ---
const HEX_SIZE = 28;

function hexToPixel(q: number, r: number, offsetX: number, offsetY: number) {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + offsetX;
  const y = HEX_SIZE * (1.5 * r) + offsetY;
  return { x, y };
}

function pointyHexCorners(cx: number, cy: number, size: number) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return pts;
}

function cornersToPath(pts: { x: number; y: number }[]) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
}

// Wall = bottom 3 edges shifted down
function wallPath(pts: { x: number; y: number }[], depth: number = 4) {
  // Bottom 3 corners: indices 2,3,4,5 (right-bottom to left-bottom)
  const wallPts = [pts[2], pts[3], pts[4], pts[5]];
  const shifted = wallPts.map((p) => ({ x: p.x, y: p.y + depth }));
  return (
    `M${pts[2].x.toFixed(1)},${pts[2].y.toFixed(1)} ` +
    `L${pts[3].x.toFixed(1)},${pts[3].y.toFixed(1)} ` +
    `L${pts[4].x.toFixed(1)},${pts[4].y.toFixed(1)} ` +
    `L${pts[5].x.toFixed(1)},${pts[5].y.toFixed(1)} ` +
    `L${shifted[3].x.toFixed(1)},${shifted[3].y.toFixed(1)} ` +
    `L${shifted[2].x.toFixed(1)},${shifted[2].y.toFixed(1)} ` +
    `L${shifted[1].x.toFixed(1)},${shifted[1].y.toFixed(1)} ` +
    `L${shifted[0].x.toFixed(1)},${shifted[0].y.toFixed(1)} Z`
  );
}

// --- Map View ---
type TileProps = {
  q: number;
  r: number;
  terrain: string;
  improvement: string;
  ownerId: string | null;
  ownerColor: string | null;
  isBorder: boolean;
  isVisible: boolean;
  units: { id: string; type: string; ownerColor: string; isOwnUnit: boolean }[];
};

function MapView(props: {
  tiles: TileProps[];
  playerColor: string;
  centerQ: number;
  centerR: number;
  pendingActionType?: string;
}) {
  const [selectedHex, setSelectedHex] = useState<TileProps | null>(null);

  if (!props.tiles || props.tiles.length === 0) {
    return (
      <div style={{ padding: 20, color: "#a08050", fontStyle: "italic" }}>
        No map data available. Use get-map to explore.
      </div>
    );
  }

  const SVG_W = 560;
  const SVG_H = 420;
  const offsetX = SVG_W / 2;
  const offsetY = SVG_H / 2;

  return (
    <div>
      {props.pendingActionType && (
        <div
          style={{
            background: "rgba(212, 160, 23, 0.2)",
            border: "1px solid #d4a017",
            borderRadius: 4,
            padding: "6px 12px",
            marginBottom: 8,
            fontSize: 13,
            color: "#d4a017",
          }}
        >
          {props.pendingActionType === "attack" && "⚔️ Attack queued — resolves next tick"}
          {props.pendingActionType === "move" && "➡️ Move queued — resolves next tick"}
          {props.pendingActionType === "defend" && "🏰 Fortify queued — resolves next tick"}
          {props.pendingActionType === "scout" && "👁️ Scout queued — resolves next tick"}
          {props.pendingActionType === "invest" && "🔨 Investment queued — resolves next tick"}
          {props.pendingActionType === "found" && "🏛 Settlement founding queued — resolves next tick"}
          {!["attack","move","defend","scout","invest","found"].includes(props.pendingActionType) &&
            `${props.pendingActionType} queued — resolves next tick`}
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <svg
          width={SVG_W}
          height={SVG_H}
          style={{
            background: "#0d0d0d",
            borderRadius: 4,
            border: "1px solid #3a2a10",
            flexShrink: 0,
          }}
        >
          {props.tiles.map((tile) => {
            const { x, y } = hexToPixel(
              tile.q - props.centerQ,
              tile.r - props.centerR,
              offsetX,
              offsetY
            );
            const corners = pointyHexCorners(x, y, HEX_SIZE - 1);
            const facePath = cornersToPath(corners);
            const wallP = wallPath(corners, 4);
            const fillColor = TERRAIN_COLORS[tile.terrain] ?? "#555";
            const wallColor = TERRAIN_WALL[tile.terrain] ?? "#333";

            const isSelected = selectedHex?.q === tile.q && selectedHex?.r === tile.r;

            return (
              <g
                key={`${tile.q}_${tile.r}`}
                onClick={() => setSelectedHex(isSelected ? null : tile)}
                style={{ cursor: "pointer" }}
              >
                {/* Wall (2.5D depth) */}
                <path d={wallP} fill={wallColor} />
                {/* Face */}
                <path
                  d={facePath}
                  fill={fillColor}
                  stroke={
                    isSelected
                      ? "#fff"
                      : tile.isBorder && tile.ownerColor
                      ? tile.ownerColor
                      : "#1a1a1a"
                  }
                  strokeWidth={isSelected ? 2 : tile.isBorder ? 2.5 : 0.5}
                />
                {/* Improvement indicator */}
                {tile.isVisible && tile.improvement !== "none" && (
                  <text
                    x={x}
                    y={y - HEX_SIZE * 0.3}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#fff"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {tile.improvement === "settlement" ? "🏛" : tile.improvement === "fortress" ? "🏰" : tile.improvement === "farm" ? "🌾" : "⛏"}
                  </text>
                )}
                {/* Unit tokens */}
                {tile.units.slice(0, 3).map((u, i) => (
                  <g key={u.id}>
                    <circle
                      cx={x + (i - 1) * 10}
                      cy={y + HEX_SIZE * 0.2}
                      r={7}
                      fill={u.ownerColor}
                      stroke={u.isOwnUnit ? "#fff" : "#000"}
                      strokeWidth={1.5}
                    />
                    <text
                      x={x + (i - 1) * 10}
                      y={y + HEX_SIZE * 0.2 + 4}
                      textAnchor="middle"
                      fontSize={8}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {UNIT_EMOJI[u.type] ?? "●"}
                    </text>
                  </g>
                ))}
                {/* Fog label */}
                {!tile.isVisible && (
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#555"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    ▓
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hex detail panel */}
        <div style={{ flex: 1, minWidth: 120, fontSize: 12 }}>
          {selectedHex ? (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid #8b6914",
                borderRadius: 4,
                padding: 10,
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
                    <div style={{ color: selectedHex.ownerColor ?? "#fff" }}>
                      ◆ Claimed
                    </div>
                  )}
                  {selectedHex.isBorder && (
                    <div style={{ color: selectedHex.ownerColor ?? "#fff" }}>
                      🏰 Border tile
                    </div>
                  )}
                  {selectedHex.units.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#a08050" }}>Units:</div>
                      {selectedHex.units.map((u) => (
                        <div key={u.id} style={{ color: u.ownerColor }}>
                          {UNIT_EMOJI[u.type]} {u.type}
                          {u.isOwnUnit ? " (yours)" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#555", fontStyle: "italic" }}>
                  Fog of war — send scouts to reveal
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#555", fontStyle: "italic", fontSize: 11 }}>
              Click a hex for details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Onboarding View ---
function OnboardingView(props: { errorMessage?: string }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ color: "#d4a017", marginBottom: 8, fontSize: 20 }}>
        Found Your Ancient Civilization
      </h2>
      <p style={{ color: "#a08050", marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
        Use the <strong style={{ color: "#e8d5a3" }}>onboard</strong> tool to establish your
        civilization. You will need to provide:
      </p>
      <ul style={{ color: "#c8b880", fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
        <li>Leader name (e.g. Ashurbanipal, Nebuchadnezzar)</li>
        <li>Civilization name and description</li>
        <li>A unique civilization bonus</li>
        <li>Your advisor — name, title, archetype, catchphrase, backstory</li>
      </ul>
      <p style={{ color: "#a08050", marginTop: 16, fontSize: 12, fontStyle: "italic" }}>
        Advisor archetypes: strategist · warmonger · merchant · scholar · mystic · diplomat
      </p>
      {props?.errorMessage && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "rgba(230, 57, 70, 0.2)",
            border: "1px solid #e63946",
            borderRadius: 4,
            color: "#e63946",
            fontSize: 13,
          }}
        >
          {props.errorMessage}
        </div>
      )}
    </div>
  );
}

// --- Profile View ---
function ProfileView(props: NonNullable<Props["profile"]>) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    function update() {
      const diff = props.player.apResetsAt - Date.now();
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
  }, [props.player.apResetsAt]);

  const apPct = (props.player.actionPoints / props.player.maxActionPoints) * 100;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: props.player.color,
            border: "2px solid #8b6914",
          }}
        />
        <div>
          <span style={{ fontSize: 16, fontWeight: "bold", color: "#d4a017" }}>
            {props.player.leaderName}
          </span>
          <span style={{ fontSize: 13, color: "#a08050", marginLeft: 8 }}>
            of {props.player.civName}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#a08050", marginBottom: 12, fontStyle: "italic" }}>
        Bonus: {props.player.civBonus}
      </div>

      {/* Resources */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {[
          { label: "🌾 Grain", val: props.player.grain },
          { label: "🪨 Stone", val: props.player.stone },
          { label: "💰 Gold", val: props.player.gold },
          { label: "📜 Knowledge", val: props.player.knowledge },
        ].map(({ label, val }) => (
          <div
            key={label}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid #3a2a10",
              borderRadius: 4,
              padding: "6px 8px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, color: "#a08050" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: "bold", color: "#e8d5a3" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* AP Bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#a08050" }}>
            Action Points: {props.player.actionPoints}/{props.player.maxActionPoints}
          </span>
          <span style={{ fontSize: 11, color: "#666" }}>Resets in: {countdown}</span>
        </div>
        <div
          style={{
            height: 8,
            background: "#1a1208",
            borderRadius: 4,
            border: "1px solid #3a2a10",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${apPct}%`,
              background: "linear-gradient(90deg, #8b6914, #d4a017)",
              borderRadius: 4,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 12, color: "#a08050" }}>
        <span>🗺 Territory: {props.territoryCount} tiles</span>
        <span>⚙ Queued: {props.queuedActionsCount} actions</span>
      </div>

      {/* Advisor */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid #3a2a10",
          borderRadius: 4,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: MOOD_COLOR[props.advisor.mood] ?? "#888",
            }}
          />
          <span style={{ color: "#d4a017", fontWeight: "bold" }}>{props.advisor.name}</span>
          <span style={{ color: "#a08050", fontSize: 11 }}>— {props.advisor.title}</span>
        </div>
        <div style={{ fontSize: 12, color: "#c8b880", fontStyle: "italic", marginBottom: 4 }}>
          "{props.advisor.catchphrase}"
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#a08050" }}>
          <span>Mood: {props.advisor.mood}</span>
          <span>Loyalty: {props.advisor.loyaltyScore}/100</span>
        </div>
      </div>

      {/* Units */}
      <div>
        <div style={{ fontSize: 12, color: "#a08050", marginBottom: 6 }}>Your Forces:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {props.units.map((u) => {
            const hpPct = (u.hp / u.maxHp) * 100;
            return (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #2a1a08",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 12,
                }}
              >
                <span>{UNIT_EMOJI[u.type] ?? "●"}</span>
                <span style={{ flex: 1, color: "#e8d5a3" }}>{u.name}</span>
                <span style={{ color: "#666" }}>
                  ({u.q},{u.r})
                </span>
                <span style={{ color: u.status === "fortified" ? "#d4a017" : "#666", fontSize: 11 }}>
                  {u.status}
                </span>
                {/* HP bar */}
                <div
                  style={{
                    width: 48,
                    height: 5,
                    background: "#1a1208",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${hpPct}%`,
                      background: hpPct > 50 ? "#2a9d8f" : hpPct > 25 ? "#e9c46a" : "#e63946",
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: "#666", minWidth: 28, textAlign: "right" }}>
                  {u.hp}/{u.maxHp}
                </span>
              </div>
            );
          })}
          {props.units.length === 0 && (
            <div style={{ color: "#555", fontStyle: "italic", fontSize: 12 }}>
              No active units
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Events View ---
type EventItem = {
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

function EventCard({
  event,
  isOwn,
}: {
  event: EventItem;
  isOwn: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const icon = EVENT_ICON[event.type] ?? EVENT_ICON.default;
  const date = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: isOwn ? "rgba(212, 160, 23, 0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isOwn ? "#8b6914" : "#2a1a08"}`,
        borderRadius: 4,
        padding: "8px 10px",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ color: "#e8d5a3", flex: 1 }}>
          <strong>{event.actorCivName}</strong>
          {event.targetCivName && ` → ${event.targetCivName}`}
          <span style={{ color: "#666", marginLeft: 8 }}>
            Tick #{event.tickNumber}
          </span>
        </span>
        <span style={{ color: "#555", fontSize: 10 }}>{date}</span>
        <span style={{ color: "#666", fontSize: 10 }}>({event.q},{event.r})</span>
      </div>
      {expanded && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: 3,
            color: "#c8b880",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          {event.narrative}
          <div style={{ marginTop: 4, fontSize: 10, color: "#666" }}>
            Outcome: {event.outcome}
          </div>
        </div>
      )}
    </div>
  );
}

function EventsView(props: NonNullable<Props["events"]>) {
  if (!props.events || props.events.length === 0) {
    return (
      <div style={{ padding: 20, color: "#555", fontStyle: "italic", textAlign: "center" }}>
        The scribes have recorded no recent events.
        <br />
        <span style={{ fontSize: 11 }}>Actions resolve every 15 minutes.</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#a08050", marginBottom: 8 }}>
        Recent Dispatches — {props.events.length} records
      </div>
      <div
        style={{
          maxHeight: 380,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingRight: 4,
        }}
      >
        {props.events.map((e, i) => (
          <EventCard
            key={`${e.tickNumber}_${e.actorCivName}_${i}`}
            event={e}
            isOwn={e.actorCivName === props.currentPlayerCivName}
          />
        ))}
      </div>
    </div>
  );
}

// --- Root Widget ---
export default function GameWidget() {
  const { props, isPending } = useWidget<Props>();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <GameChrome>
          <LoadingScreen />
        </GameChrome>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <GameChrome
        subtitle={
          props.view === "profile" && props.profile
            ? `${props.profile.player.civName}`
            : undefined
        }
      >
        {props.view === "onboarding" && (
          <OnboardingView {...(props.onboarding ?? {})} />
        )}
        {props.view === "map" && props.map && <MapView {...props.map} />}
        {props.view === "profile" && props.profile && (
          <ProfileView {...props.profile} />
        )}
        {props.view === "events" && props.events && (
          <EventsView {...props.events} />
        )}
      </GameChrome>
    </McpUseProvider>
  );
}
