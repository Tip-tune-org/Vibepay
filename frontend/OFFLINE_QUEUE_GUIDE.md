# Offline Queue Implementation Guide

## Overview

The VibePay PWA now includes a robust offline queue system that allows users to continue interacting with the app even when offline. Actions are queued locally in IndexedDB and automatically replayed when the connection is restored.

## Architecture

### Components

1. **offlineQueue.ts** - Core queue manager using IndexedDB
2. **sw.js** - Service worker with background sync implementation
3. **serviceWorker.ts** - Integration utilities for the app layer

### Data Flow

```
User Action (Offline)
    ↓
Queue in IndexedDB
    ↓
Register Background Sync
    ↓
Network Restored
    ↓
Service Worker Replays Queue
    ↓
Notify App of Success/Failure
```

## Features

### ✅ Implemented

- **IndexedDB Storage**: Persistent queue storage that survives page reloads
- **Priority Queue**: Actions are replayed based on priority (high to low) then timestamp
- **Duplicate Protection**: Idempotency keys prevent duplicate actions
- **Retry Logic**: Configurable max retries with exponential backoff
- **Replay Metadata**: Full history of replay attempts with success/failure tracking
- **Background Sync**: Automatic replay when network is restored (if supported)
- **Manual Replay**: Fallback for browsers without background sync support
- **UI Notifications**: Service worker shows notifications for sync results
- **Event System**: Custom events for app to react to sync success/failure

### Queue Statistics

The system tracks:
- Total queued actions
- Total failed attempts
- Total successful syncs
- Oldest/newest action timestamps

## Usage

### Basic Usage

```typescript
import { queueOfflineRequest } from '@/utils/serviceWorker';

// Queue a request
const actionId = await queueOfflineRequest('/api/tips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ artistId: '123', amount: 10 }),
  priority: 10, // Higher = more important
  maxRetries: 5,
  idempotencyKey: 'tip-123-1234567890', // Prevents duplicates
  metadata: { type: 'tip', artistId: '123' } // App-specific data
});
```

### Advanced Patterns

#### 1. Wrap API Calls

```typescript
async function sendTipWithOfflineSupport(artistId: string, amount: number) {
  if (isOnline()) {
    try {
      return await apiClient.post('/api/tips', { artistId, amount });
    } catch (error) {
      // Queue on network error
      if (error.message.includes('Network')) {
        await queueOfflineRequest('/api/tips', {
          method: 'POST',
          body: JSON.stringify({ artistId, amount }),
          priority: 10,
          maxRetries: 5,
          idempotencyKey: `tip-${artistId}-${Date.now()}`
        });
        return { queued: true };
      }
      throw error;
    }
  } else {
    // Queue immediately when offline
    await queueOfflineRequest('/api/tips', {
      method: 'POST',
      body: JSON.stringify({ artistId, amount }),
      priority: 10,
      maxRetries: 5,
      idempotencyKey: `tip-${artistId}-${Date.now()}`
    });
    return { queued: true };
  }
}
```

#### 2. React Hook for Queue Status

```typescript
import { useOfflineQueue } from '@/utils/offlineQueueIntegration.example';

function MyComponent() {
  const { stats, isOnline, syncSupported, manualSync } = useOfflineQueue();
  
  return (
    <div>
      <p>Status: {isOnline ? 'Online' : 'Offline'}</p>
      {stats && <p>Queued: {stats.totalQueued}</p>}
      {!syncSupported && (
        <button onClick={manualSync}>Sync Now</button>
      )}
    </div>
  );
}
```

#### 3. Listen to Sync Events

```typescript
// Success handler
window.addEventListener('offline-sync-success', (event: CustomEvent) => {
  const { actionId, url, method } = event.detail;
  console.log(`Action ${actionId} synced: ${method} ${url}`);
  // Update UI, show toast, etc.
});

// Failure handler
window.addEventListener('offline-sync-failed', (event: CustomEvent) => {
  const { actionId, error, permanent, retryCount } = event.detail;
  if (permanent) {
    console.error(`Action ${actionId} permanently failed: ${error}`);
    // Show error to user
  } else {
    console.warn(`Action ${actionId} failed (retry ${retryCount}): ${error}`);
    // Show temporary warning
  }
});
```

### Priority Guidelines

Use these priority levels for different action types:

- **10**: Critical user actions (tips, purchases)
- **7-9**: Important user content (playlist creation, comments)
- **4-6**: Standard interactions (likes, follows)
- **1-3**: Analytics and tracking (play counts, view events)

### Idempotency Keys

Always provide idempotency keys for actions that should not be duplicated:

```typescript
// Good patterns
`tip-${artistId}-${timestamp}`
`playlist-${userId}-${playlistName}-${timestamp}`
`comment-${trackId}-${userId}-${timestamp}`

// Avoid
Math.random().toString() // Not deterministic
userId // Too broad, allows duplicates
```

## API Reference

### offlineQueue

Core queue manager instance.

#### Methods

- `enqueue(action)` - Add action to queue
- `getAll()` - Get all queued actions (sorted by priority)
- `get(id)` - Get specific action by ID
- `remove(id)` - Remove action from queue
- `incrementRetry(id)` - Increment retry count
- `saveReplayMetadata(metadata)` - Save replay attempt metadata
- `getReplayHistory(actionId)` - Get replay history for action
- `getStats()` - Get queue statistics
- `clearQueue()` - Clear all queued actions
- `clearMetadata()` - Clear all replay metadata
- `pruneMetadata(keepPerAction)` - Remove old metadata

### serviceWorker.ts

Integration utilities.

#### Functions

- `queueOfflineRequest(url, options)` - Queue a request
- `manualReplayQueue()` - Manually trigger replay
- `getQueueStats()` - Get queue statistics
- `getQueuedActions()` - Get all queued actions
- `clearQueuedAction(id)` - Clear specific action
- `clearAllQueuedActions()` - Clear all actions
- `getReplayHistory(id)` - Get replay history
- `isBackgroundSyncSupported()` - Check sync support
- `isOnline()` - Check online status
- `setupOnlineOfflineListeners(onOnline, onOffline)` - Set up listeners

## Service Worker

The service worker (`sw.js`) handles background sync automatically:

1. Listens for `sync` events with tag `offline-replay`
2. Opens IndexedDB and retrieves queued actions
3. Replays actions in priority order
4. Saves metadata for each attempt
5. Removes successful actions from queue
6. Increments retry count for failures
7. Removes actions that exceed max retries
8. Notifies app via postMessage
9. Shows notifications for sync results

## Browser Support

### Background Sync

- ✅ Chrome/Edge 49+
- ✅ Opera 36+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

For browsers without background sync, the system falls back to manual replay when the app detects the network is restored.

### IndexedDB

- ✅ All modern browsers
- ✅ Chrome/Edge/Firefox/Safari
- ✅ Mobile browsers

## Testing

### Unit Tests

Run the test suite:

```bash
npm test offlineQueue.test.ts
```

Tests cover:
- Queue enqueue/dequeue operations
- Duplicate protection via idempotency keys
- Priority sorting
- Retry logic
- Metadata persistence
- Statistics calculation

### Browser Testing

1. **Queue Actions Offline**
   - Open DevTools → Network → Set to "Offline"
   - Perform actions (tip, create playlist, etc.)
   - Check IndexedDB in Application tab
   - Verify actions are queued

2. **Replay on Reconnect**
   - Set Network back to "Online"
   - Wait for background sync or trigger manual sync
   - Verify actions are replayed
   - Check server logs for received requests

3. **Duplicate Protection**
   - Queue same action twice with same idempotency key
   - Verify only one entry in queue
   - Verify only one request sent to server

4. **Notification Click Routing**
   - Queue actions and sync
   - Click on sync notification
   - Verify app navigates to correct page

5. **Max Retries**
   - Queue action with maxRetries: 1
   - Ensure server returns error
   - Trigger sync twice
   - Verify action is removed after max retries

## Troubleshooting

### Actions Not Replaying

1. Check if service worker is registered:
   ```javascript
   navigator.serviceWorker.getRegistration().then(console.log)
   ```

2. Check IndexedDB for queued actions:
   - Open DevTools → Application → IndexedDB → VibePayOfflineQueue

3. Check console for errors during replay

4. Manually trigger replay:
   ```javascript
   import { manualReplayQueue } from '@/utils/serviceWorker';
   manualReplayQueue().then(console.log);
   ```

### Duplicate Actions

1. Ensure idempotency keys are unique per action
2. Check server-side idempotency handling
3. Verify actions are removed after successful replay

### Service Worker Not Updating

1. Unregister and re-register:
   ```javascript
   navigator.serviceWorker.getRegistrations().then(regs => 
     regs.forEach(reg => reg.unregister())
   );
   ```

2. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

3. Clear site data in DevTools → Application → Clear storage

## Performance Considerations

### IndexedDB Operations

- All operations are asynchronous
- Transactions are automatically committed
- Indexes improve query performance

### Queue Size

- Monitor queue size with `getStats()`
- Consider pruning old metadata periodically
- Set reasonable maxRetries to avoid infinite growth

### Network Usage

- Actions replay in priority order
- Failed actions don't block subsequent actions
- Consider batching similar actions server-side

## Security

### Data Storage

- Queue data is stored in IndexedDB (origin-scoped)
- No sensitive data should be stored in metadata
- Auth tokens are read from localStorage at replay time

### Idempotency

- Server must validate idempotency keys
- Prevent replay attacks with timestamp validation
- Consider adding HMAC signatures for critical actions

## Future Enhancements

Potential improvements:

- [ ] Batch replay for similar actions
- [ ] Exponential backoff for retries
- [ ] Conflict resolution for concurrent edits
- [ ] Compression for large payloads
- [ ] Encryption for sensitive data
- [ ] Periodic background sync (every N hours)
- [ ] Queue size limits with LRU eviction
- [ ] Analytics dashboard for queue metrics

## References

- [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/)
