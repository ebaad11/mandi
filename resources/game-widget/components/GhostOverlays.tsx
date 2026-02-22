import type { PendingAction } from "../types";
import { hexToPixel, HEX_SIZE } from "../hex-utils";

export function GhostOverlays({
  actions,
  mapData,
  offsetX,
  offsetY,
}: {
  actions: PendingAction[];
  mapData: { centerQ: number; centerR: number; playerColor: string };
  offsetX: number;
  offsetY: number;
}) {
  return (
    <>
      {actions.map((action, idx) => {
        const fromPx = hexToPixel(action.fromQ - mapData.centerQ, action.fromR - mapData.centerR, offsetX, offsetY);
        const toPx = hexToPixel(action.targetQ - mapData.centerQ, action.targetR - mapData.centerR, offsetX, offsetY);
        const ghostStyle: React.CSSProperties = { pointerEvents: "none", animation: "ghost-pulse 2s ease-in-out infinite" };

        if (action.type === "move") {
          const dx = toPx.x - fromPx.x;
          const dy = toPx.y - fromPx.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const headLen = 8;
          const headW = 5;
          const tipX = toPx.x;
          const tipY = toPx.y;
          const baseX = tipX - ux * headLen;
          const baseY = tipY - uy * headLen;
          const leftX = baseX - uy * headW;
          const leftY = baseY + ux * headW;
          const rightX = baseX + uy * headW;
          const rightY = baseY - ux * headW;

          return (
            <g key={`ghost-${idx}`} style={{ pointerEvents: "none" }}>
              <line x1={fromPx.x} y1={fromPx.y} x2={toPx.x - ux * headLen * 0.5} y2={toPx.y - uy * headLen * 0.5} stroke={mapData.playerColor} strokeWidth={5} strokeLinecap="round" opacity={0.15} />
              <line x1={fromPx.x} y1={fromPx.y} x2={toPx.x - ux * headLen * 0.5} y2={toPx.y - uy * headLen * 0.5} stroke={mapData.playerColor} strokeWidth={3} strokeLinecap="round" strokeDasharray="8 8" style={{ animation: "arrow-march 0.6s linear infinite" }} opacity={0.85} />
              <polygon points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`} fill={mapData.playerColor} opacity={0.9} style={{ animation: "ghost-pulse 2s ease-in-out infinite" }} />
              <circle cx={toPx.x} cy={toPx.y + HEX_SIZE * 0.2} r={8} fill={mapData.playerColor} stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" style={{ animation: "ghost-bob 1.5s ease-in-out infinite" }} />
            </g>
          );
        }

        if (action.type === "scout") {
          return (
            <g key={`ghost-${idx}`} style={ghostStyle}>
              <circle cx={fromPx.x} cy={fromPx.y} r={HEX_SIZE * 2.5} fill="none" stroke="#4a9aff" strokeWidth={2} strokeDasharray="6 4" opacity={0.5} />
              <circle cx={fromPx.x} cy={fromPx.y} r={HEX_SIZE * 1.5} fill="none" stroke="#4a9aff" strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
              <text x={fromPx.x} y={fromPx.y - HEX_SIZE * 0.6} textAnchor="middle" fontSize={10} opacity={0.7} style={{ pointerEvents: "none", userSelect: "none" }}>👁</text>
            </g>
          );
        }

        if (action.type === "attack") {
          return (
            <g key={`ghost-${idx}`} style={ghostStyle}>
              <line x1={fromPx.x} y1={fromPx.y} x2={toPx.x} y2={toPx.y} stroke="#e63946" strokeWidth={2} strokeDasharray="5 3" opacity={0.6} />
              <text x={toPx.x} y={toPx.y + 4} textAnchor="middle" fontSize={14} opacity={0.7} style={{ pointerEvents: "none", userSelect: "none" }}>⚔️</text>
            </g>
          );
        }

        if (action.type === "defend") {
          return (
            <g key={`ghost-${idx}`} style={ghostStyle}>
              <circle cx={fromPx.x} cy={fromPx.y} r={HEX_SIZE * 0.7} fill="none" stroke="#2a9d8f" strokeWidth={2.5} strokeDasharray="6 3" opacity={0.6} />
              <text x={fromPx.x} y={fromPx.y - HEX_SIZE * 0.6} textAnchor="middle" fontSize={11} opacity={0.7} style={{ pointerEvents: "none", userSelect: "none" }}>🛡</text>
            </g>
          );
        }

        if (action.type === "found") {
          return (
            <g key={`ghost-${idx}`} style={ghostStyle}>
              <text x={toPx.x} y={toPx.y - HEX_SIZE * 0.3} textAnchor="middle" fontSize={14} opacity={0.5} style={{ pointerEvents: "none", userSelect: "none" }}>🏛</text>
              <circle cx={toPx.x} cy={toPx.y} r={HEX_SIZE * 0.65} fill="none" stroke={mapData.playerColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4} />
            </g>
          );
        }

        if (action.type === "invest") {
          return (
            <g key={`ghost-${idx}`} style={ghostStyle}>
              <text x={toPx.x} y={toPx.y + 4} textAnchor="middle" fontSize={12} opacity={0.5} style={{ pointerEvents: "none", userSelect: "none" }}>🔨</text>
              <circle cx={toPx.x} cy={toPx.y} r={HEX_SIZE * 0.5} fill="none" stroke="#e9c46a" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.4} />
            </g>
          );
        }

        return null;
      })}
    </>
  );
}
