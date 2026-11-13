import { CACHE_MAX_BYTES, CACHE_TTL_MS } from "./config";

export interface CacheMeta {
  key: string;
  size: number;
  lastAccess: number;
  storedAt: number;
}

export interface TileCache {
  get(key: string): Promise<ArrayBuffer | null>;
  put(key: string, bytes: ArrayBuffer): Promise<void>;
}

export function isExpired(storedAt: number, now: number, ttl = CACHE_TTL_MS): boolean {
  return now - storedAt > ttl;
}

/** Oldest entries first, until existing bytes plus the incoming tile fit the cap. */
export function keysToEvict(existing: CacheMeta[], incomingBytes: number, maxBytes: number): string[] {
  let total = incomingBytes;
  for (const entry of existing) total += entry.size;
  if (total <= maxBytes) return [];
  const sorted = [...existing].sort(
    (a, b) => a.lastAccess - b.lastAccess || a.key.localeCompare(b.key),
  );
  const drop: string[] = [];
  for (const entry of sorted) {
    if (total <= maxBytes) break;
    drop.push(entry.key);
    total -= entry.size;
  }
  return drop;
}

interface MemoryEntry extends CacheMeta {
  bytes: ArrayBuffer;
}

export function createMemoryCache(now: () => number = Date.now): TileCache {
  const entries = new Map<string, MemoryEntry>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (isExpired(entry.storedAt, now())) {
        entries.delete(key);
        return null;
      }
      entry.lastAccess = now();
      return entry.bytes;
    },
    async put(key, bytes) {
      const others: CacheMeta[] = [];
      for (const entry of entries.values()) {
        if (entry.key === key) continue;
        if (isExpired(entry.storedAt, now())) {
          entries.delete(entry.key);
          continue;
        }
        others.push(entry);
      }
      for (const drop of keysToEvict(others, bytes.byteLength, CACHE_MAX_BYTES)) entries.delete(drop);
      const stamp = now();
      entries.set(key, { key, size: bytes.byteLength, lastAccess: stamp, storedAt: stamp, bytes });
    },
  };
}

const DB_NAME = "gtaworld";
const DB_VERSION = 1;
const META = "meta";
const BLOBS = "blobs";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function createIdbCache(): Promise<TileCache> {
  const db = await openDb();
  return {
    async get(key) {
      const tx = db.transaction([META, BLOBS], "readwrite");
      const metaStore = tx.objectStore(META);
      const blobStore = tx.objectStore(BLOBS);
      const metaReq = metaStore.get(key);
      const blobReq = blobStore.get(key);
      const meta = (await request<CacheMeta | undefined>(metaReq)) ?? null;
      const blob = (await request<{ key: string; bytes: ArrayBuffer } | undefined>(blobReq)) ?? null;
      if (!meta || !blob) {
        await transactionDone(tx);
        return null;
      }
      const now = Date.now();
      if (isExpired(meta.storedAt, now)) {
        metaStore.delete(key);
        blobStore.delete(key);
        await transactionDone(tx);
        return null;
      }
      meta.lastAccess = now;
      metaStore.put(meta);
      await transactionDone(tx);
      return blob.bytes;
    },
    async put(key, bytes) {
      const tx = db.transaction([META, BLOBS], "readwrite");
      const metaStore = tx.objectStore(META);
      const blobStore = tx.objectStore(BLOBS);
      const all = await request<CacheMeta[]>(metaStore.getAll());
      const now = Date.now();
      const drop = new Set<string>();
      const fresh: CacheMeta[] = [];
      for (const meta of all) {
        if (meta.key === key || isExpired(meta.storedAt, now)) {
          if (meta.key !== key) drop.add(meta.key);
          continue;
        }
        fresh.push(meta);
      }
      for (const old of keysToEvict(fresh, bytes.byteLength, CACHE_MAX_BYTES)) drop.add(old);
      for (const old of drop) {
        metaStore.delete(old);
        blobStore.delete(old);
      }
      metaStore.put({ key, size: bytes.byteLength, lastAccess: now, storedAt: now } satisfies CacheMeta);
      blobStore.put({ key, bytes });
      await transactionDone(tx);
    },
  };
}

export async function createTileCache(): Promise<TileCache> {
  if (typeof indexedDB === "undefined") return createMemoryCache();
  try {
    return await createIdbCache();
  } catch {
    return createMemoryCache();
  }
}
