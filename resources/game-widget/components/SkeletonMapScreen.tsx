import { hexToPixel, pointyHexCorners, cornersToPath, wallPath, HEX_SIZE } from "../hex-utils";

export function SkeletonMapScreen() {
  const radius = 5;
  const hexes: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r });
    }
  }

  const SVG_W = 560;
  const SVG_H = 420;
  const offsetX = SVG_W / 2;
  const offsetY = SVG_H / 2;

  const barStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    gap: 14,
    background: "rgba(20, 14, 6, 0.97)",
    flexShrink: 0,
  };

  const block = (w: number, delay = "0s") => (
    <div
      style={{
        width: w,
        height: 11,
        borderRadius: 3,
        background: "#2a1a08",
        animation: `sk-pulse 1.8s ease-in-out ${delay} infinite`,
      }}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#0d0d0d" }}>
      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.55; }
        }
      `}</style>

      <div style={{ ...barStyle, height: 40, borderBottom: "1px solid #2a1a08" }}>
        {(["🌾", "🪨", "💰", "📜"] as const).map((icon, i) => (
          <div key={icon} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13, opacity: 0.25 }}>{icon}</span>
            {block(28, `${i * 0.15}s`)}
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {block(52, "0.2s")}
          {block(38, "0.4s")}
        </div>
      </div>

      <svg
        width="100%"
        height="380"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", background: "#0d0d0d" }}
      >
        {hexes.map(({ q, r }, idx) => {
          const { x, y } = hexToPixel(q, r, offsetX, offsetY);
          const corners = pointyHexCorners(x, y, HEX_SIZE - 1);
          const facePath = cornersToPath(corners);
          const wallP = wallPath(corners, 4);
          const delay = `${((idx * 0.07) % 1.2).toFixed(2)}s`;
          return (
            <g key={`${q}_${r}`} style={{ animation: `sk-pulse 1.8s ease-in-out ${delay} infinite` }}>
              <path d={wallP} fill="#1a1a1a" />
              <path d={facePath} fill="#222" stroke="#1a1a1a" strokeWidth={0.5} />
            </g>
          );
        })}
      </svg>

      <div
        style={{
          ...barStyle,
          height: "auto",
          padding: "8px 14px",
          borderTop: "1px solid #2a1a08",
          alignItems: "flex-start",
          flexDirection: "row",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {block(140, "0.1s")}
          {block(190, "0.3s")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          {block(130, "0.2s")}
          {block(90, "0.4s")}
        </div>
      </div>
    </div>
  );
}
