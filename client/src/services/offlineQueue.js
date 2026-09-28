/**
 * Resilient Offline Queue Service for NAWI-ReportPro
 * Conforms to OIML R-76 & Indian Legal Metrology Field Operations
 * Provides persistent IndexedDB storage with LocalStorage fallback,
 * idempotency key generation, draft management, and auto-sync queue draining.
 */

import apiClient from '../hooks/useApi';

const DB_NAME = 'NAWI_OFFLINE_DB';
const DB_VERSION = 1;
const STORE_QUEUE = 'offline_queue';
const STORE_DRAFTS = 'offline_drafts';
const STORE_INSTRUMENTS = 'cached_instruments';
const STORE_LOGS = 'sync_audit_log';

// In-memory fallback if IndexedDB is unavailable
let isIndexedDBSupported = typeof window !== 'undefined' && 'indexedDB' in window;
let dbInstance = null;
let isDraining = false;
const subscribers = new Set();

/**
 * Generate cryptographically resilient idempotency key
 * Format: nawi_idemp_{prefix}_{randomHex}_{timestamp}
 */
export function generateIdempotencyKey(prefix = 'sync') {
  const timestamp = Date.now();
  let randomPart = '';

  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    randomPart = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    randomPart = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  }

  return `nawi_idemp_${prefix}_${randomPart}_${timestamp}`;
}

/**
 * Initialize IndexedDB database connection
 */
export async function getDB() {
  if (!isIndexedDBSupported) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Offline Queue Store
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'idempotencyKey' });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 2. Offline Drafts Store
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const draftStore = db.createObjectStore(STORE_DRAFTS, { keyPath: 'draftId' });
          draftStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 3. Cached Instruments Store
        if (!db.objectStoreNames.contains(STORE_INSTRUMENTS)) {
          db.createObjectStore(STORE_INSTRUMENTS, { keyPath: 'id' });
        }

        // 4. Sync Audit Log Store
        if (!db.objectStoreNames.contains(STORE_LOGS)) {
          const logStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('[OfflineQueue] IndexedDB open error, falling back to localStorage:', event.target.error);
        isIndexedDBSupported = false;
        resolve(null);
      };
    } catch (err) {
      console.warn('[OfflineQueue] IndexedDB exception, falling back to localStorage:', err);
      isIndexedDBSupported = false;
      resolve(null);
    }
  });
}

/**
 * Notify all subscribed React hooks/components of state changes
 */
function notifySubscribers(eventData) {
  subscribers.forEach((callback) => {
    try {
      callback(eventData);
    } catch (err) {
      console.error('[OfflineQueue] Subscriber notification error:', err);
    }
  });
}

/**
 * Subscribe to offline queue state updates
 */
export function subscribeToQueue(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// -------------------------------------------------------------
// LOCALSTORAGE FALLBACK IMPLEMENTATION
// -------------------------------------------------------------

const LS_QUEUE_KEY = 'nawi_offline_queue_v1';
const LS_DRAFTS_KEY = 'nawi_offline_drafts_v1';
const LS_INSTRUMENTS_KEY = 'nawi_cached_instruments_v1';
const LS_LOGS_KEY = 'nawi_sync_audit_logs_v1';

const memoryStore = {};

function getLS(key, defaultVal = []) {
  try {
    if (typeof localStorage === 'undefined') {
      return memoryStore[key] !== undefined ? JSON.parse(JSON.stringify(memoryStore[key])) : defaultVal;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLS(key, value) {
  try {
    if (typeof localStorage === 'undefined') {
      memoryStore[key] = JSON.parse(JSON.stringify(value));
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[OfflineQueue] LocalStorage write error for ${key}:`, err);
  }
}

// -------------------------------------------------------------
// QUEUE MUTATIONS & TEST SESSIONS
// -------------------------------------------------------------

/**
 * Enqueue a test session mutation to persistent offline storage
 */
export async function queueTestSession(sessionPayload) {
  const db = await getDB();
  const idempotencyKey = sessionPayload.idempotencyKey || generateIdempotencyKey('session');
  const now = new Date().toISOString();

  const item = {
    idempotencyKey,
    localId: sessionPayload.localId || sessionPayload.id || generateIdempotencyKey('loc'),
    instrumentId: sessionPayload.instrumentId,
    certificateNo: sessionPayload.certificateNo || null,
    testDate: sessionPayload.testDate || now,
    overallStatus: sessionPayload.overallStatus || sessionPayload.status || 'COMPLETED',
    overallResult: sessionPayload.overallResult || sessionPayload.result || null,
    temperature: sessionPayload.temperature != null ? Number(sessionPayload.temperature) : null,
    humidity: sessionPayload.humidity != null ? Number(sessionPayload.humidity) : null,
    remarks: sessionPayload.remarks || '',
    results: Array.isArray(sessionPayload.results) ? sessionPayload.results : [],
    status: 'PENDING',
    retryCount: 0,
    createdAt: sessionPayload.createdAt || now,
    updatedAt: now,
  };

  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } else {
    const queue = getLS(LS_QUEUE_KEY, []);
    const existingIndex = queue.findIndex((q) => q.idempotencyKey === idempotencyKey);
    if (existingIndex >= 0) {
      queue[existingIndex] = item;
    } else {
      queue.push(item);
    }
    setLS(LS_QUEUE_KEY, queue);
  }

  notifySubscribers({ type: 'ENQUEUED', item });

  // If online, attempt immediate opportunistic drain
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    setTimeout(() => {
      drainQueue().catch(() => {});
    }, 100);
  }

  return item;
}

/**
 * Get all pending items in offline queue
 */
export async function getPendingQueue() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        const pending = items.filter((i) => i.status === 'PENDING' || i.status === 'RETRY');
        resolve(pending.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  const queue = getLS(LS_QUEUE_KEY, []);
  return queue
    .filter((i) => i.status === 'PENDING' || i.status === 'RETRY')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Get count of pending items in offline queue
 */
export async function getPendingCount() {
  const pending = await getPendingQueue();
  return pending.length;
}

/**
 * Remove an item from the offline queue after successful sync
 */
export async function removeQueuedItem(idempotencyKey) {
  const db = await getDB();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.delete(idempotencyKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } else {
    const queue = getLS(LS_QUEUE_KEY, []);
    const updated = queue.filter((i) => i.idempotencyKey !== idempotencyKey);
    setLS(LS_QUEUE_KEY, updated);
  }

  notifySubscribers({ type: 'REMOVED', idempotencyKey });
}

/**
 * Persist a single queue item (insert or overwrite by idempotency key).
 * Used to update retry counters and status without touching other items.
 */
async function persistQueueItem(item) {
  const db = await getDB();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } else {
    const queue = getLS(LS_QUEUE_KEY, []);
    const idx = queue.findIndex((q) => q.idempotencyKey === item.idempotencyKey);
    if (idx >= 0) {
      queue[idx] = item;
    } else {
      queue.push(item);
    }
    setLS(LS_QUEUE_KEY, queue);
  }
}

/**
 * Clear entire offline queue
 */
export async function clearOfflineQueue() {
  const db = await getDB();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } else {
    setLS(LS_QUEUE_KEY, []);
  }

  notifySubscribers({ type: 'CLEARED' });
}

// -------------------------------------------------------------
// DRAFT MANAGEMENT
// -------------------------------------------------------------

export async function saveDraft(draftIdOrObject, draftDataParam) {
  const db = await getDB();
  const now = new Date().toISOString();
  
  let draftId = '';
  let draftData = {};

  if (typeof draftIdOrObject === 'object' && draftIdOrObject !== null) {
    draftId = draftIdOrObject.draftId || draftIdOrObject.id || `draft-${Date.now()}`;
    draftData = draftIdOrObject;
  } else {
    draftId = draftIdOrObject;
    draftData = draftDataParam || {};
  }

  const record = {
    ...draftData,
    draftId,
    updatedAt: now,
  };

  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } else {
    const drafts = getLS(LS_DRAFTS_KEY, {});
    drafts[draftId] = record;
    setLS(LS_DRAFTS_KEY, drafts);
  }

  notifySubscribers({ type: 'DRAFT_SAVED', draftId });
  return record;
}

/**
 * Retrieve saved draft
 */
export async function getDraft(draftId) {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.get(draftId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  const drafts = getLS(LS_DRAFTS_KEY, {});
  return drafts[draftId] || null;
}

/**
 * List all saved drafts
 */
export async function listDrafts() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  const drafts = getLS(LS_DRAFTS_KEY, {});
  return Object.values(drafts);
}

/**
 * Delete a draft
 */
export async function deleteDraft(draftId) {
  const db = await getDB();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.delete(draftId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } else {
    const drafts = getLS(LS_DRAFTS_KEY, {});
    delete drafts[draftId];
    setLS(LS_DRAFTS_KEY, drafts);
  }

  notifySubscribers({ type: 'DRAFT_DELETED', draftId });
}

// -------------------------------------------------------------
// CACHED INSTRUMENTS REFERENCE DATA
// -------------------------------------------------------------

/**
 * Cache list of instruments for offline dropdown selection
 */
export async function cacheInstruments(instruments) {
  if (!Array.isArray(instruments)) return;

  const db = await getDB();
  if (db) {
    const tx = db.transaction(STORE_INSTRUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_INSTRUMENTS);
    instruments.forEach((inst) => store.put(inst));
  } else {
    setLS(LS_INSTRUMENTS_KEY, instruments);
  }
}

/**
 * Retrieve cached instruments for offline field operations
 */
export async function getCachedInstruments() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_INSTRUMENTS, 'readonly');
      const store = tx.objectStore(STORE_INSTRUMENTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  return getLS(LS_INSTRUMENTS_KEY, []);
}

// -------------------------------------------------------------
// SYNC AUDIT LOGS
// -------------------------------------------------------------

export async function addSyncAuditLog(entry) {
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_LOGS, 'readwrite');
      const store = tx.objectStore(STORE_LOGS);
      store.add(record);
    } catch {
      // ignore
    }
  } else {
    const logs = getLS(LS_LOGS_KEY, []);
    logs.unshift(record);
    if (logs.length > 50) logs.length = 50; // Keep last 50
    setLS(LS_LOGS_KEY, logs);
  }
}

export async function getSyncAuditLogs() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_LOGS, 'readonly');
      const store = tx.objectStore(STORE_LOGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const logs = req.result || [];
        resolve(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      };
      req.onerror = () => resolve([]);
    });
  }

  return getLS(LS_LOGS_KEY, []);
}

// -------------------------------------------------------------
// RESILIENT QUEUE DRAIN MANAGER
// -------------------------------------------------------------

/**
 * Drain the offline queue by transmitting pending batches to the backend
 * Guarantees idempotency and handles duplicate skips safely.
 */
export async function drainQueue(customClient = null) {
  if (isDraining) {
    return { success: false, inProgress: true, message: 'Sync already in progress' };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, offline: true, message: 'Client is offline' };
  }

  const client = customClient || apiClient;
  const pending = await getPendingQueue();

  if (!pending || pending.length === 0) {
    return { success: true, count: 0, message: 'Offline queue is clean' };
  }

  isDraining = true;
  notifySubscribers({ type: 'SYNC_STARTED', pendingCount: pending.length });

  const batchKey = generateIdempotencyKey('batch');
  let officerId = null;

  try {
    const authUser = localStorage.getItem('nawi_auth_user');
    if (authUser) {
      officerId = JSON.parse(authUser).id;
    }
  } catch {
    // fallback
  }

  const payload = {
    idempotencyKey: batchKey,
    timestamp: new Date().toISOString(),
    offlineOfficerId: officerId,
    sessions: pending.map((item) => ({
      localId: item.localId || item.idempotencyKey,
      idempotencyKey: item.idempotencyKey,
      instrumentId: item.instrumentId,
      certificateNo: item.certificateNo,
      testDate: item.testDate,
      overallStatus: item.overallStatus,
      overallResult: item.overallResult,
      temperature: item.temperature,
      humidity: item.humidity,
      remarks: item.remarks,
      results: item.results,
    })),
  };

  try {
    const response = await client.post('/sync/batch', payload);
    const data = response.data;

    if (data.success) {
      // Remove all successfully processed items from queue
      const processedKeys = new Set(
        data.processedKeys || pending.map((p) => p.idempotencyKey)
      );

      for (const item of pending) {
        if (processedKeys.has(item.idempotencyKey)) {
          await removeQueuedItem(item.idempotencyKey);
        }
      }

      await addSyncAuditLog({
        batchId: batchKey,
        status: 'SUCCESS',
        syncedCount: data.syncedCount || pending.length,
        duplicateCount: data.duplicateCount || 0,
        sessionIds: data.sessionIds || [],
      });

      isDraining = false;
      notifySubscribers({
        type: 'SYNC_COMPLETED',
        syncedCount: data.syncedCount || pending.length,
        sessionIds: data.sessionIds,
      });

      return {
        success: true,
        syncedCount: data.syncedCount || pending.length,
        duplicateCount: data.duplicateCount || 0,
        sessionIds: data.sessionIds,
      };
    } else {
      throw new Error(data.message || 'Batch sync returned failure status');
    }
  } catch (error) {
    console.error('[OfflineQueue] Batch sync error:', error.message || error);

    // Mark every still-pending item as RETRY and bump its retry counter, so
    // getPendingQueue's RETRY filter reflects real state and operators can see
    // how many transmission attempts a queued session has survived.
    const failedAt = new Date().toISOString();
    for (const item of pending) {
      try {
        await persistQueueItem({
          ...item,
          status: 'RETRY',
          retryCount: (Number(item.retryCount) || 0) + 1,
          lastError: error.response?.data?.message || error.message || 'Network connection failed',
          lastAttemptAt: failedAt,
          updatedAt: failedAt,
        });
      } catch {
        // Best-effort counter update; a persist failure must not mask the sync error.
      }
    }

    await addSyncAuditLog({
      batchId: batchKey,
      status: 'FAILED',
      itemCount: pending.length,
      error: error.response?.data?.message || error.message || 'Network connection failed',
    });

    isDraining = false;
    notifySubscribers({
      type: 'SYNC_FAILED',
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Sync failed',
    };
  } finally {
    isDraining = false;
  }
}

// -------------------------------------------------------------
// AUTO-DRAIN ON RECONNECT
// -------------------------------------------------------------

if (typeof window !== 'undefined') {
  // Listen to browser network changes
  window.addEventListener('online', () => {
    if (import.meta.env?.DEV) {
      console.debug('[OfflineQueue] Network connection re-established. Initiating auto-drain...');
    }
    // Debounce to let network settle
    setTimeout(() => {
      drainQueue().catch((err) => {
        console.warn('[OfflineQueue] Auto-drain on reconnection encountered error:', err.message);
      });
    }, 1500);
  });

  // Listen to Service Worker message triggers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
        drainQueue().catch(() => {});
      }
    });
  }
}

export default {
  generateIdempotencyKey,
  queueTestSession,
  getPendingQueue,
  getPendingCount,
  removeQueuedItem,
  clearOfflineQueue,
  saveDraft,
  getDraft,
  listDrafts,
  deleteDraft,
  cacheInstruments,
  getCachedInstruments,
  addSyncAuditLog,
  getSyncAuditLogs,
  drainQueue,
  subscribeToQueue,
};
