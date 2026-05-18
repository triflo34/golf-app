"use client";

/**
 * Minimal IndexedDB-backed FIFO queue for offline mutations.
 *
 * Used to hold POST/PATCH requests (mainly score saves) when the device is
 * offline so the user can keep playing through bad cell coverage. When the
 * browser fires the `online` event, `flushQueue()` replays them in order.
 *
 * No retries beyond "next online event" — a stuck request stays at the head
 * of the queue until the user manually clears it or the network comes back.
 */

const DB_NAME = "golf-offline";
const DB_VERSION = 1;
const STORE = "mutations";

export type QueuedMutation = {
  id?: number;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body: unknown;
  enqueued_at: string;
  label?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
      .catch(reject);
  });
}

export async function enqueueMutation(m: Omit<QueuedMutation, "id" | "enqueued_at"> & {
  enqueued_at?: string;
}): Promise<number> {
  const row: QueuedMutation = {
    ...m,
    enqueued_at: m.enqueued_at ?? new Date().toISOString(),
  };
  return withStore("readwrite", (store) => {
    return new Promise<number>((resolve, reject) => {
      const req = store.add(row);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function listQueue(): Promise<QueuedMutation[]> {
  return withStore("readonly", (store) => {
    return new Promise<QueuedMutation[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as QueuedMutation[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function removeFromQueue(id: number): Promise<void> {
  return withStore("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export async function clearQueue(): Promise<void> {
  return withStore("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export async function countQueue(): Promise<number> {
  return withStore("readonly", (store) => {
    return new Promise<number>((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  });
}

let flushing = false;

/**
 * Drain the queue serially. Stops on the first server error (so a 400 doesn't
 * silently discard all queued work). Returns the number of items replayed.
 */
export async function flushQueue(): Promise<{ flushed: number; failed: QueuedMutation | null }> {
  if (flushing) return { flushed: 0, failed: null };
  flushing = true;
  let flushed = 0;
  try {
    const items = await listQueue();
    items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    for (const m of items) {
      try {
        const res = await fetch(m.url, {
          method: m.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m.body),
        });
        if (!res.ok) {
          // Server rejected — leave at head, return so user can investigate.
          return { flushed, failed: m };
        }
        if (m.id != null) await removeFromQueue(m.id);
        flushed += 1;
      } catch {
        // Network error → still offline. Stop draining.
        return { flushed, failed: m };
      }
    }
    return { flushed, failed: null };
  } finally {
    flushing = false;
  }
}

/**
 * Wrap a fetch call so it auto-queues on offline / network failure. Returns
 * the Response if online, or null if the request was queued for later.
 *
 * Callers should treat null as "save accepted, will sync later" and update
 * their optimistic UI accordingly.
 */
export async function fetchOrQueue(
  url: string,
  init: { method: "POST" | "PATCH" | "DELETE"; body: unknown; label?: string },
): Promise<Response | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueueMutation({
      method: init.method,
      url,
      body: init.body,
      label: init.label,
    });
    return null;
  }
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(init.body),
    });
    return res;
  } catch {
    // Network blew up mid-request — queue it.
    await enqueueMutation({
      method: init.method,
      url,
      body: init.body,
      label: init.label,
    });
    return null;
  }
}
