// =============================================================
// collaborationProvider.ts
// Issue #446 — Collaboration Provider Productionization
//
// Abstracts the Yjs sync transport so the collaboration feature
// can run against a local/mock provider or a real WebSocket
// server — without hardcoding wss://demos.yjs.dev anywhere.
// =============================================================

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

/** Shape of a collaborator visible in the UI */
export interface Collaborator {
  id: number;          // Yjs client ID
  name: string;
  color: string;       // hex colour for avatar ring
  joinedAt: number;    // unix ms
}

/** Everything a provider must expose to the hook */
export interface CollaborationProvider {
  /** The shared Yjs document — single source of truth */
  doc: Y.Doc;

  /** The shared array of track IDs in the playlist */
  tracks: Y.Array<string>;

  /** Live awareness state — who else is in the session */
  awareness: {
    getStates(): Map<number, Record<string, unknown>>;
    setLocalStateField(key: string, value: unknown): void;
    on(event: string, handler: () => void): void;
    off(event: string, handler: () => void): void;
  };

  /** Current connection status */
  status: "connecting" | "connected" | "disconnected";

  /** Tear down the connection cleanly */
  destroy(): void;
}

// -------------------------------------------------------------
// Provider config — read from env, never hardcoded
// -------------------------------------------------------------

export interface ProviderConfig {
  /** WebSocket URL of your sync server */
  serverUrl: string;
  /** Unique room / playlist ID */
  roomId: string;
  /** Display name for this user */
  userName: string;
  /** Colour for this user's avatar ring (hex) */
  userColor?: string;
}

const DEFAULT_COLOR = "#4DA3FF"; // VibePay blue

// -------------------------------------------------------------
// Real WebSocket provider (production)
// Reads URL from VITE_COLLAB_SERVER_URL env var.
// Falls back to localhost:1234 for local dev.
// NEVER falls back to demos.yjs.dev.
// -------------------------------------------------------------

export function createWebSocketProvider(config: ProviderConfig): CollaborationProvider {
  const { serverUrl, roomId, userName, userColor = DEFAULT_COLOR } = config;

  const doc = new Y.Doc();
  const tracks = doc.getArray<string>("playlist-tracks");

  const wsProvider = new WebsocketProvider(serverUrl, roomId, doc, {
    connect: true,
    // Reconnect automatically on drop — up to 10 tries, 2s apart
    maxBackoffTime: 2500,
  });

  // Set our own presence so others can see us
  wsProvider.awareness.setLocalStateField("user", {
    name: userName,
    color: userColor,
    joinedAt: Date.now(),
  });

  let status: CollaborationProvider["status"] = "connecting";

  wsProvider.on("status", ({ status: s }: { status: string }) => {
    status = s as CollaborationProvider["status"];
  });

  return {
    doc,
    tracks,
    awareness: wsProvider.awareness,
    get status() { return status; },
    destroy() {
      wsProvider.disconnect();
      doc.destroy();
    },
  };
}

// -------------------------------------------------------------
// Mock / local provider (testing + local dev without a server)
// Uses only in-memory Yjs — no network at all.
// -------------------------------------------------------------

export function createMockProvider(config: Pick<ProviderConfig, "userName" | "userColor">): CollaborationProvider {
  const { userName, userColor = DEFAULT_COLOR } = config;

  const doc = new Y.Doc();
  const tracks = doc.getArray<string>("playlist-tracks");

  // Simple in-memory awareness — a plain Map + event emitter
  const awarenessStates = new Map<number, Record<string, unknown>>();
  const listeners = new Map<string, Set<() => void>>();

  const clientID = doc.clientID;
  awarenessStates.set(clientID, {
    user: { name: userName, color: userColor, joinedAt: Date.now() },
  });

  const awareness = {
    getStates() { return awarenessStates; },
    setLocalStateField(key: string, value: unknown) {
      const current = awarenessStates.get(clientID) ?? {};
      awarenessStates.set(clientID, { ...current, [key]: value });
      // Notify listeners
      listeners.get("change")?.forEach((fn) => fn());
    },
    on(event: string, handler: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off(event: string, handler: () => void) {
      listeners.get(event)?.delete(handler);
    },
  };

  return {
    doc,
    tracks,
    awareness,
    status: "connected", // mock is always "connected"
    destroy() {
      doc.destroy();
      listeners.clear();
      awarenessStates.clear();
    },
  };
}

// -------------------------------------------------------------
// Factory — picks the right provider automatically
// Usage:
//   const provider = createCollaborationProvider({ roomId, userName })
//
// In test/local: set VITE_COLLAB_SERVER_URL="" or "mock"
// In production: set VITE_COLLAB_SERVER_URL="wss://your-server.com"
// -------------------------------------------------------------

export function createCollaborationProvider(
  config: Omit<ProviderConfig, "serverUrl">
): CollaborationProvider {
  const serverUrl = import.meta.env?.VITE_COLLAB_SERVER_URL ?? "";

  // Use mock when: no URL set, explicitly "mock", or running in test
  const useMock =
    !serverUrl ||
    serverUrl === "mock" ||
    typeof process !== "undefined" && process.env.NODE_ENV === "test";

  if (useMock) {
    return createMockProvider({
      userName: config.userName,
      userColor: config.userColor,
    });
  }

  return createWebSocketProvider({ ...config, serverUrl });
}
