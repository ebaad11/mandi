import type { ActionMode } from "./types";

// --- Terrain colors ---
export const TERRAIN_COLORS: Record<string, string> = {
  plains: "#c8a96e",
  desert: "#d4a857",
  mountain: "#8b7355",
  forest: "#5a7a3a",
  river: "#4a7a9b",
  sea: "#2d5a7a",
  fog: "#2a2a2a",
};

export const TERRAIN_WALL: Record<string, string> = {
  plains: "#a08040",
  desert: "#b08830",
  mountain: "#5a4a30",
  forest: "#3a5a1a",
  river: "#2a5a7a",
  sea: "#1a3a5a",
  fog: "#1a1a1a",
};

// --- Unit emoji ---
export const UNIT_EMOJI: Record<string, string> = {
  spearman: "🗡",
  archer: "🏹",
  cavalry: "🐴",
  siege: "⚙",
  builder: "🔨",
  scout: "👁",
};

// --- Event icons ---
export const EVENT_ICON: Record<string, string> = {
  attack: "⚔️",
  fortify: "🏰",
  invest: "🔨",
  scout: "👁️",
  diplomacy: "🤝",
  found: "🏛",
  move: "➡️",
  default: "📜",
};

// --- Mood colors ---
export const MOOD_COLOR: Record<string, string> = {
  confident: "#2a9d8f",
  worried: "#e9c46a",
  desperate: "#e63946",
  triumphant: "#f4a261",
  suspicious: "#6a4c93",
  mourning: "#457b9d",
};

// --- AP costs per action ---
export const AP_COSTS: Record<ActionMode, number> = {
  move: 1,
  attack: 2,
  defend: 1,
  scout: 1,
  found: 3,
  invest: 2,
};

// --- Action labels ---
export const ACTION_LABELS: Record<ActionMode, { emoji: string; label: string }> = {
  move: { emoji: "🚶", label: "Move" },
  attack: { emoji: "⚔", label: "Attack" },
  defend: { emoji: "🛡", label: "Defend" },
  scout: { emoji: "👁", label: "Scout" },
  found: { emoji: "🏛", label: "Found" },
  invest: { emoji: "🔨", label: "Invest" },
};

// --- Impassable terrain for movement ---
export const IMPASSABLE = new Set(["sea", "mountain", "fog"]);
