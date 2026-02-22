import { useState } from "react";
import type { Props, EventItem } from "../types";
import { EVENT_ICON } from "../constants";

function EventCard({ event, isOwn }: { event: EventItem; isOwn: boolean }) {
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
          <span style={{ color: "#666", marginLeft: 8 }}>Tick #{event.tickNumber}</span>
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
          <div style={{ marginTop: 4, fontSize: 10, color: "#666" }}>Outcome: {event.outcome}</div>
        </div>
      )}
    </div>
  );
}

export function EventsPanel({
  eventsData,
  onClose,
}: {
  eventsData: Props["events"] | null;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 260,
        zIndex: 20,
        background: "rgba(13, 9, 3, 0.97)",
        borderLeft: "1px solid #8b6914",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Cinzel', Georgia, serif",
        color: "#e8d5a3",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #3a2a10",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: "bold", color: "#d4a017" }}>📜 Dispatches</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#665540", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {!eventsData || eventsData.events.length === 0 ? (
          <div style={{ padding: 16, color: "#555", fontStyle: "italic", textAlign: "center", fontSize: 12 }}>
            The scribes have recorded no recent events.
            <br />
            <span style={{ fontSize: 11 }}>Actions resolve every 2 minutes.</span>
          </div>
        ) : (
          eventsData.events.map((e, i) => (
            <EventCard
              key={`${e.tickNumber}_${e.actorCivName}_${i}`}
              event={e}
              isOwn={e.actorCivName === eventsData.currentPlayerCivName}
            />
          ))
        )}
      </div>
    </div>
  );
}
