import { buildTileWorld } from "./buildWorld";
import { createTileCache, type TileCache } from "./cache";
import { cacheKey, KEEP_TILE_RADIUS, MAX_IN_FLIGHT, TILE_ZOOM, tileUrl } from "./config";
import { decodeTile } from "./decode";
import { mercatorToTile, tileChebyshev, tileKey, type TileId } from "./project";
import type { TileWorld } from "./types";

class Gate {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = () => {
        this.active += 1;
        fn().then(resolve, reject).finally(() => {
          this.active -= 1;
          const next = this.waiting.shift();
          if (next) next();
        });
      };
      if (this.active < this.max) start();
      else this.waiting.push(start);
    });
  }
}

const gate = new Gate(MAX_IN_FLIGHT);

export async function loadTileBytes(id: TileId, cache: TileCache): Promise<{ bytes: Uint8Array; fromCache: boolean }> {
  const key = cacheKey(id.z, id.x, id.y);
  const cached = await cache.get(key);
  if (cached) return { bytes: new Uint8Array(cached), fromCache: true };
  return gate.run(async () => {
    const again = await cache.get(key);
    if (again) return { bytes: new Uint8Array(again), fromCache: true };
    const response = await fetch(tileUrl(id.z, id.x, id.y));
    if (!response.ok) throw new Error(`Tile ${key} returned ${response.status}`);
    const bytes = await response.arrayBuffer();
    try {
      await cache.put(key, bytes);
    } catch {
      // The tile is still usable this session when the cache is full or blocked.
    }
    return { bytes: new Uint8Array(bytes), fromCache: false };
  });
}

export class TileStream {
  readonly worlds = new Map<string, TileWorld>();
  hits = 0;
  misses = 0;
  private readonly inflight = new Set<string>();
  private readonly retryAt = new Map<string, number>();
  private readonly failures = new Map<string, number>();

  constructor(private readonly cache: TileCache) {}

  get waiting(): number {
    return this.retryAt.size;
  }

  isLoading(id: TileId): boolean {
    return this.inflight.has(tileKey(id));
  }

  isFailed(id: TileId): boolean {
    return this.retryAt.has(tileKey(id));
  }

  wanted(x: number, y: number, vx: number, vy: number): TileId[] {
    const center = mercatorToTile(x, y, TILE_ZOOM);
    const tiles: TileId[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = 2 ** TILE_ZOOM;
        const wrappedX = ((center.x + dx) % n + n) % n;
        const wrappedY = center.y + dy;
        if (wrappedY < 0 || wrappedY >= n) continue;
        tiles.push({ z: TILE_ZOOM, x: wrappedX, y: wrappedY });
      }
    }
    const speed = Math.hypot(vx, vy);
    if (speed > 3 && Number.isFinite(speed)) {
      const ahead = mercatorToTile(x + (vx / speed) * 1800, y + (vy / speed) * 1800, TILE_ZOOM);
      if (!tiles.some((tile) => tile.x === ahead.x && tile.y === ahead.y)) tiles.push(ahead);
    }
    return tiles;
  }

  update(x: number, y: number, vx: number, vy: number): void {
    const center = mercatorToTile(x, y, TILE_ZOOM);
    for (const key of [...this.worlds.keys()]) {
      const [z, tx, ty] = key.split("/").map(Number);
      if (tileChebyshev({ z, x: tx, y: ty }, center) > KEEP_TILE_RADIUS) this.worlds.delete(key);
    }
    const now = Date.now();
    for (const id of this.wanted(x, y, vx, vy)) {
      const key = tileKey(id);
      if (this.worlds.has(key) || this.inflight.has(key)) continue;
      if (now < (this.retryAt.get(key) ?? 0)) continue;
      this.inflight.add(key);
      loadTileBytes(id, this.cache)
        .then(({ bytes, fromCache }) => {
          if (fromCache) this.hits += 1;
          else this.misses += 1;
          this.worlds.set(key, buildTileWorld(id, decodeTile(bytes, id)));
          this.retryAt.delete(key);
          this.failures.delete(key);
        })
        .catch(() => {
          const attempt = (this.failures.get(key) ?? 0) + 1;
          this.failures.set(key, attempt);
          this.retryAt.set(key, Date.now() + Math.min(20000, 2000 * 2 ** (attempt - 1)));
        })
        .finally(() => {
          this.inflight.delete(key);
        });
    }
  }
}

let shared: Promise<TileCache> | null = null;

export function sharedCache(): Promise<TileCache> {
  if (!shared) shared = createTileCache();
  return shared;
}
