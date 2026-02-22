import { useState, useEffect } from "react";
import type { Props } from "../types";
import { UNIT_EMOJI, MOOD_COLOR } from "../constants";

export function ProfilePanel({
  profileData,
  onClose,
}: {
  profileData: Props["profile"] | null;
  onClose: () => void;
}) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!profileData) return;
    function update() {
      const diff = profileData!.player.apResetsAt - Date.now();
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
  }, [profileData?.player.apResetsAt]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: 260,
        zIndex: 20,
        background: "rgba(13, 9, 3, 0.97)",
        borderTop: "1px solid #8b6914",
        fontFamily: "'Cinzel', Georgia, serif",
        color: "#e8d5a3",
        overflowY: "auto",
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
          position: "sticky",
          top: 0,
          background: "rgba(13, 9, 3, 0.99)",
        }}
      >
        {profileData ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: profileData.player.color,
                border: "1px solid #8b6914",
              }}
            />
            <span style={{ fontWeight: "bold", color: "#d4a017", fontSize: 13 }}>
              {profileData.player.leaderName}
            </span>
            <span style={{ color: "#a08050", fontSize: 12 }}>· {profileData.player.civName}</span>
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: 12 }}>Profile</span>
        )}
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#665540", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ✕
        </button>
      </div>

      {!profileData ? (
        <div style={{ padding: 16, color: "#555", fontStyle: "italic", textAlign: "center", fontSize: 12 }}>
          Call get-profile to view your civilization details.
        </div>
      ) : (
        <div style={{ padding: "8px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
            {[
              { label: "🌾", val: profileData.player.grain },
              { label: "🪨", val: profileData.player.stone },
              { label: "💰", val: profileData.player.gold },
              { label: "📜", val: profileData.player.knowledge },
            ].map(({ label, val }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid #3a2a10",
                  borderRadius: 3,
                  padding: "4px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#a08050" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: "bold", color: "#e8d5a3" }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11, color: "#a08050" }}>
              <span>AP: {profileData.player.actionPoints}/{profileData.player.maxActionPoints}</span>
              <span style={{ color: "#666" }}>resets in {countdown}</span>
            </div>
            <div style={{ height: 6, background: "#1a1208", borderRadius: 3, border: "1px solid #3a2a10", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${(profileData.player.actionPoints / profileData.player.maxActionPoints) * 100}%`,
                  background: "linear-gradient(90deg, #8b6914, #d4a017)",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 11, color: "#a08050" }}>
            <span>🗺 {profileData.territoryCount} tiles</span>
            <span>⚙ {profileData.queuedActionsCount} queued</span>
            <span style={{ color: "#665540", fontStyle: "italic", fontSize: 10 }}>{profileData.player.civBonus}</span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #3a2a10", borderRadius: 4, padding: "6px 8px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: MOOD_COLOR[profileData.advisor.mood] ?? "#888" }} />
              <span style={{ color: "#d4a017", fontWeight: "bold", fontSize: 12 }}>{profileData.advisor.name}</span>
              <span style={{ color: "#a08050", fontSize: 11 }}>— {profileData.advisor.title}</span>
            </div>
            <div style={{ fontSize: 11, color: "#c8b880", fontStyle: "italic", marginBottom: 3 }}>
              "{profileData.advisor.catchphrase}"
            </div>
            <div style={{ fontSize: 10, color: "#a08050" }}>
              {profileData.advisor.mood} · loyalty {profileData.advisor.loyaltyScore}/100
            </div>
          </div>

          {profileData.units.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#a08050", marginBottom: 4 }}>Forces:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {profileData.units.map((u) => {
                  const hpPct = (u.hp / u.maxHp) * 100;
                  return (
                    <div
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid #2a1a08",
                        borderRadius: 3,
                        padding: "3px 6px",
                        fontSize: 11,
                      }}
                    >
                      <span>{UNIT_EMOJI[u.type] ?? "●"}</span>
                      <span style={{ flex: 1, color: "#e8d5a3" }}>{u.name}</span>
                      <div style={{ width: 40, height: 4, background: "#1a1208", borderRadius: 2, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${hpPct}%`,
                            background: hpPct > 50 ? "#2a9d8f" : hpPct > 25 ? "#e9c46a" : "#e63946",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: "#666" }}>{u.hp}/{u.maxHp}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
