export function OnboardingView(props: { errorMessage?: string }) {
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
