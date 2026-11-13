import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS } from "../src/world/config";
import { createMemoryCache, isExpired, keysToEvict, type CacheMeta } from "../src/world/cache";

describe("tile cache", () => {
  it("drops the least recently used entries until the cap fits", () => {
    const existing: CacheMeta[] = [
      { key: "old", size: 50, lastAccess: 1, storedAt: 1 },
      { key: "mid", size: 40, lastAccess: 2, storedAt: 2 },
      { key: "new", size: 30, lastAccess: 3, storedAt: 3 },
    ];
    expect(keysToEvict(existing, 40, 100)).toEqual(["old", "mid"]);
    expect(keysToEvict(existing, 10, 200)).toEqual([]);
  });

  it("forgets entries after 30 days", async () => {
    expect(isExpired(0, CACHE_TTL_MS + 1)).toBe(true);
    let now = 1_000;
    const cache = createMemoryCache(() => now);
    await cache.put("tile", new Uint8Array([1, 2, 3]).buffer);
    expect(new Uint8Array(await cache.get("tile") ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
    now += CACHE_TTL_MS + 5;
    expect(await cache.get("tile")).toBeNull();
  });
});
