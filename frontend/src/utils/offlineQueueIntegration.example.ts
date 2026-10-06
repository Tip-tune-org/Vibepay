/**
 * Example integration patterns for offline queue in VibePay application
 * 
 * This file demonstrates how to integrate the offline queue system
 * into various parts of the application.
 */

import {
  queueOfflineRequest,
  setupOnlineOfflineListeners,
  getQueueStats,
  getQueuedActions,
  manualReplayQueue,
  isOnline,
  isBackgroundSyncSupported,
} from './serviceWorker';
import apiClient from './api';

/**
 * Example 1: Wrap API calls with offline queue support
 * 
 * This pattern automatically queues requests when offline and retries when online.
 */
export async function sendTipWithOfflineSupport(
  artistId: string,
  amount: number,
  message?: string
) {
  const requestBody = { artistId, amount, message };
  const url = `/api/tips`;

  // Check if online
  if (isOnline()) {
    // Try normal request first
    try {
      const response = await apiClient.post(url, requestBody);
      return { success: true, data: response.data };
    } catch (error) {
      // If network error, queue for later
      if (error instanceof Error && error.message.includes('Network')) {
        const actionId = await queueOfflineRequest(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          priority: 10, // High priority for tips
          maxRetries: 5,
          idempotencyKey: `tip-${artistId}-${Date.now()}`,
          metadata: { type: 'tip', artistId, amount },
        });
        return { success: false, queued: true, actionId };
      }
      throw error;
    }
  } else {
    // Offline - queue immediately
    const actionId = await queueOfflineRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      priority: 10,
      maxRetries: 5,
      idempotencyKey: `tip-${artistId}-${Date.now()}`,
      metadata: { type: 'tip', artistId, amount },
    });
    return { success: false, queued: true, actionId };
  }
}

/**
 * Example 2: Queue a playlist creation
 */
export async function createPlaylistOffline(
  name: string,
  description: string,
  trackIds: string[]
) {
  const url = `/api/playlists`;
  const requestBody = { name, description, trackIds };

  const actionId = await queueOfflineRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    priority: 5, // Medium priority
    maxRetries: 3,
    idempotencyKey: `playlist-${name}-${Date.now()}`,
    metadata: { type: 'playlist', name, trackCount: trackIds.length },
  });

  return actionId;
}

/**
 * Example 3: Queue a track play event
 */
export async function recordTrackPlayOffline(
  trackId: string,
  userId: string,
  listenDuration: number
) {
  const url = `/api/plays/record`;
  const requestBody = { trackId, userId, listenDuration, source: 'web' };

  const actionId = await queueOfflineRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    priority: 3, // Lower priority for analytics
    maxRetries: 3,
    idempotencyKey: `play-${trackId}-${userId}-${Date.now()}`,
    metadata: { type: 'play', trackId, userId },
  });

  return actionId;
}

/**
 * Example 4: React hook for offline queue status
 */
export function useOfflineQueue() {
  const [stats, setStats] = React.useState<any>(null);
  const [isOnlineState, setIsOnlineState] = React.useState(isOnline());
  const [syncSupported, setSyncSupported] = React.useState(isBackgroundSyncSupported());

  React.useEffect(() => {
    // Load initial stats
    getQueueStats().then(setStats);

    // Set up online/offline listeners
    const cleanup = setupOnlineOfflineListeners(
      () => {
        setIsOnlineState(true);
        // Refresh stats after sync
        setTimeout(() => getQueueStats().then(setStats), 2000);
      },
      () => {
        setIsOnlineState(false);
      }
    );

    // Listen for sync events
    const handleSyncSuccess = (event: CustomEvent) => {
      console.log('Sync success:', event.detail);
      getQueueStats().then(setStats);
    };

    const handleSyncFailed = (event: CustomEvent) => {
      console.error('Sync failed:', event.detail);
      getQueueStats().then(setStats);
    };

    window.addEventListener('offline-sync-success', handleSyncSuccess as EventListener);
    window.addEventListener('offline-sync-failed', handleSyncFailed as EventListener);

    // Refresh stats periodically
    const interval = setInterval(() => {
      getQueueStats().then(setStats);
    }, 10000);

    return () => {
      cleanup();
      window.removeEventListener('offline-sync-success', handleSyncSuccess as EventListener);
      window.removeEventListener('offline-sync-failed', handleSyncFailed as EventListener);
      clearInterval(interval);
    };
  }, []);

  const manualSync = async () => {
    const result = await manualReplayQueue();
    await getQueueStats().then(setStats);
    return result;
  };

  return {
    stats,
    isOnline: isOnlineState,
    syncSupported,
    manualSync,
  };
}

/**
 * Example 5: Offline queue status component
 */
export function OfflineQueueStatus() {
  const { stats, isOnline: online, syncSupported, manualSync } = useOfflineQueue();
  const [syncing, setSyncing] = React.useState(false);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await manualSync();
      alert(`Synced ${result.succeeded.length} actions, ${result.failed.length} failed`);
    } catch (error) {
      alert('Sync failed: ' + error);
    } finally {
      setSyncing(false);
    }
  };

  if (!stats) return null;

  return (
    <div className="offline-queue-status">
      <div className="status-indicator">
        <span className={online ? 'online' : 'offline'}>
          {online ? '🟢 Online' : '🔴 Offline'}
        </span>
      </div>

      {stats.totalQueued > 0 && (
        <div className="queue-info">
          <p>{stats.totalQueued} action(s) queued</p>
          {syncSupported ? (
            <p>Will sync automatically when online</p>
          ) : (
            <button onClick={handleManualSync} disabled={syncing || !online}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      )}

      {stats.totalFailed > 0 && (
        <div className="failed-info">
          <p className="error">{stats.totalFailed} action(s) failed</p>
        </div>
      )}
    </div>
  );
}

/**
 * Example 6: Show queued actions in UI
 */
export function QueuedActionsPanel() {
  const [actions, setActions] = React.useState<any[]>([]);

  React.useEffect(() => {
    const loadActions = async () => {
      const queued = await getQueuedActions();
      setActions(queued);
    };

    loadActions();

    // Refresh when sync events occur
    const handleSync = () => loadActions();
    window.addEventListener('offline-sync-success', handleSync);
    window.addEventListener('offline-sync-failed', handleSync);

    return () => {
      window.removeEventListener('offline-sync-success', handleSync);
      window.removeEventListener('offline-sync-failed', handleSync);
    };
  }, []);

  if (actions.length === 0) {
    return <p>No queued actions</p>;
  }

  return (
    <div className="queued-actions">
      <h3>Queued Actions ({actions.length})</h3>
      <ul>
        {actions.map((action) => (
          <li key={action.id}>
            <strong>{action.method}</strong> {action.url}
            <br />
            <small>
              Priority: {action.priority} | Retries: {action.retryCount}/{action.maxRetries}
              {action.metadata && ` | Type: ${action.metadata.type}`}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Example 7: Initialize offline queue in app startup
 */
export async function initializeOfflineQueue() {
  console.log('Initializing offline queue...');

  // Check support
  const syncSupported = isBackgroundSyncSupported();
  console.log('Background Sync supported:', syncSupported);

  // Set up listeners
  setupOnlineOfflineListeners(
    () => {
      console.log('Back online - sync will trigger automatically');
    },
    () => {
      console.log('Gone offline - requests will be queued');
    }
  );

  // Get initial stats
  const stats = await getQueueStats();
  console.log('Queue stats:', stats);

  // If there are queued items and we're online, trigger sync
  if (stats.totalQueued > 0 && isOnline()) {
    console.log('Found queued items, triggering sync...');
    const result = await manualReplayQueue();
    console.log('Sync result:', result);
  }
}

// Note: This is an example file. Import React if you want to use the hooks/components:
// import React from 'react';
