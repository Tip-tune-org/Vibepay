// =============================================================
// CollaborativePlaylist.tsx
// Issue #446 — Collaboration Provider Productionization
//
// UI component for a shared, real-time playlist.
// Reads from useCollaboration — knows nothing about Yjs or
// WebSockets directly.
// =============================================================

import React, { useState } from "react";
import { useCollaboration } from "../../hooks/useCollaboration";

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

interface CollaborativePlaylistProps {
  /** Unique ID for this playlist session (used as Yjs room) */
  roomId: string;
  /** Display name shown to other collaborators */
  userName: string;
  /** Optional user colour (hex) */
  userColor?: string;
}

// -------------------------------------------------------------
// Status badge colours
// -------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  connected: "#9BF0E1",      // VibePay mint
  connecting: "#FFD166",     // VibePay gold
  disconnected: "#ff6b6b",   // red
};

// -------------------------------------------------------------
// Component
// -------------------------------------------------------------

export const CollaborativePlaylist: React.FC<CollaborativePlaylistProps> = ({
  roomId,
  userName,
  userColor = "#4DA3FF",
}) => {
  const {
    trackIds,
    collaborators,
    connectionStatus,
    addTrack,
    removeTrack,
    isReady,
  } = useCollaboration({ roomId, userName, userColor });

  const [newTrackId, setNewTrackId] = useState("");

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------

  const handleAdd = () => {
    const trimmed = newTrackId.trim();
    if (!trimmed) return;
    addTrack(trimmed);
    setNewTrackId("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // ----------------------------------------------------------
  // Loading state
  // ----------------------------------------------------------

  if (!isReady) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Connecting to session…</p>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div style={styles.container}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={styles.header}>
        <h2 style={styles.title}>Collaborative Playlist</h2>

        {/* Connection status badge */}
        <span
          style={{
            ...styles.statusBadge,
            backgroundColor: STATUS_COLORS[connectionStatus] ?? "#ccc",
          }}
          data-testid="connection-status"
        >
          {connectionStatus}
        </span>
      </div>

      {/* ── Collaborators ──────────────────────────────────── */}
      <div style={styles.collaboratorsRow} data-testid="collaborators">
        {collaborators.map((c) => (
          <div
            key={c.id}
            title={c.name}
            style={{
              ...styles.avatar,
              borderColor: c.color,
            }}
            data-testid={`collaborator-${c.id}`}
          >
            {c.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {collaborators.length === 0 && (
          <span style={styles.emptyHint}>No other collaborators yet</span>
        )}
      </div>

      {/* ── Disconnect warning ─────────────────────────────── */}
      {connectionStatus === "disconnected" && (
        <div style={styles.disconnectBanner} data-testid="disconnect-banner">
          ⚠️ Connection lost — changes will sync when reconnected
        </div>
      )}

      {/* ── Track list ─────────────────────────────────────── */}
      <ul style={styles.trackList} data-testid="track-list">
        {trackIds.length === 0 && (
          <li style={styles.emptyHint}>No tracks yet — add one below!</li>
        )}
        {trackIds.map((id, index) => (
          <li key={`${id}-${index}`} style={styles.trackItem}>
            <span style={styles.trackIndex}>{index + 1}</span>
            <span style={styles.trackId} data-testid={`track-${index}`}>
              {id}
            </span>
            <button
              style={styles.removeButton}
              onClick={() => removeTrack(index)}
              aria-label={`Remove track ${id}`}
              data-testid={`remove-track-${index}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* ── Add track ──────────────────────────────────────── */}
      <div style={styles.addRow}>
        <input
          style={styles.input}
          type="text"
          placeholder="Paste track ID…"
          value={newTrackId}
          onChange={(e) => setNewTrackId(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="track-input"
        />
        <button
          style={styles.addButton}
          onClick={handleAdd}
          data-testid="add-track-button"
        >
          Add Track
        </button>
      </div>

    </div>
  );
};

// -------------------------------------------------------------
// Inline styles — matches VibePay colour palette
// -------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0B1C2D",
    borderRadius: 12,
    padding: 24,
    color: "#fff",
    fontFamily: "sans-serif",
    maxWidth: 560,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: "#6EDCFF",
  },
  statusBadge: {
    padding: "4px 10px",
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 600,
    color: "#0B1C2D",
    textTransform: "capitalize",
  },
  collaboratorsRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    alignItems: "center",
    flexWrap: "wrap",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "2px solid",
    backgroundColor: "#1a2e45",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
    cursor: "default",
  },
  disconnectBanner: {
    backgroundColor: "#3a1515",
    border: "1px solid #ff6b6b",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 12,
    fontSize: 13,
    color: "#ff9999",
  },
  trackList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    marginBottom: 16,
    maxHeight: 320,
    overflowY: "auto",
  },
  trackItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #1a2e45",
  },
  trackIndex: {
    color: "#4DA3FF",
    fontWeight: 700,
    width: 24,
    textAlign: "right",
    flexShrink: 0,
  },
  trackId: {
    flex: 1,
    fontSize: 14,
    color: "#cde",
    wordBreak: "break-all",
  },
  removeButton: {
    background: "none",
    border: "none",
    color: "#ff6b6b",
    cursor: "pointer",
    fontSize: 16,
    padding: "0 4px",
    flexShrink: 0,
  },
  addRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#1a2e45",
    border: "1px solid #4DA3FF",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  },
  addButton: {
    backgroundColor: "#4DA3FF",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    color: "#0B1C2D",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  },
  loadingText: {
    color: "#6EDCFF",
  },
  emptyHint: {
    color: "#445",
    fontSize: 13,
  },
};

export default CollaborativePlaylist;
