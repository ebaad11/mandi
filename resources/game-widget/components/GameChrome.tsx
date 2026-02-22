const chromeStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #2a1f0e 0%, #1a1208 100%)",
  border: "2px solid #8b6914",
  borderRadius: 8,
  padding: 16,
  minHeight: 400,
  fontFamily: "'Cinzel', Georgia, serif",
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

export function GameChrome({
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
