// Minimal in-memory Redis fake for friend-store / profile-store tests.
//
// Implements only the surface the store modules actually use:
//   get, set (with `nx`), del, smembers, sadd, srem, scard, pipeline + exec.
//
// Pipelines are batched but eager — each command executes immediately when
// chained, mirroring how Upstash REST's pipeline behaves (no real
// MULTI/EXEC transactionality). The fake is good enough to verify
// correctness of the store's logic (which keys land where) but not to
// catch real cross-command race behavior.

type AnyVal = unknown;

export class FakeRedis {
  // String + JSON values land in this map.
  store = new Map<string, AnyVal>();
  // Set values keyed by the same namespace.
  sets = new Map<string, Set<string>>();
  // Sorted-set values — Map<member, score>, kept sorted by member at
  // read-time. Lex ranges use ascending member ordering.
  zsets = new Map<string, Map<string, number>>();
  // Last TTL (in seconds) attached to each key by the most recent set().
  // Not honored — keys don't actually expire — but exposed so tests can
  // assert that the production code passed the right ex option.
  ttls = new Map<string, number | undefined>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get<T = any>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set(
    key: string,
    value: AnyVal,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<"OK" | null> {
    if (opts?.nx && this.store.has(key)) return null;
    this.store.set(key, value);
    this.ttls.set(key, opts?.ex);
    return "OK";
  }

  async del(key: string): Promise<number> {
    const hadStr = this.store.delete(key);
    const hadSet = this.sets.delete(key);
    return hadStr || hadSet ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key) ?? new Set();
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m);
        added++;
      }
    }
    this.sets.set(key, s);
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) {
      if (s.delete(m)) removed++;
    }
    return removed;
  }

  // ── Sorted set ops (subset used by pool invite + pseudo index) ─────────

  async zadd(
    key: string,
    ...entries: Array<{ score: number; member: string }>
  ): Promise<number> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    let added = 0;
    for (const { score, member } of entries) {
      if (!z.has(member)) added++;
      z.set(member, score);
    }
    this.zsets.set(key, z);
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    let removed = 0;
    for (const m of members) {
      if (z.delete(m)) removed++;
    }
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  /** Lex range — supports `[<from>` (inclusive) and `[<to>` (inclusive) only,
   *  matching Upstash's documented usage. `(` (exclusive) and `+`/`-` (open)
   *  aren't needed by our callers; tests pass concrete bounds. */
  async zrange(
    key: string,
    min: string,
    max: string,
    opts?: { byLex?: boolean; offset?: number; count?: number },
  ): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) return [];
    if (!opts?.byLex) {
      throw new Error("FakeRedis.zrange currently only supports byLex:true");
    }
    const lo = parseLex(min);
    const hi = parseLex(max);
    const all = [...z.keys()].sort();
    let matches = all.filter((m) => m >= lo && m <= hi);
    const offset = opts?.offset ?? 0;
    const count = opts?.count ?? matches.length;
    matches = matches.slice(offset, offset + count);
    return matches;
  }

  pipeline() {
    const calls: Array<() => Promise<unknown>> = [];
    // The pipeline shape Upstash provides: chain commands, then .exec().
    const api: PipelineLike = {
      get: (key) => {
        calls.push(() => this.get(key));
        return api;
      },
      set: (key, value, opts) => {
        calls.push(() => this.set(key, value, opts));
        return api;
      },
      del: (key) => {
        calls.push(() => this.del(key));
        return api;
      },
      scard: (key) => {
        calls.push(() => this.scard(key));
        return api;
      },
      sadd: (key, member) => {
        calls.push(() => this.sadd(key, member));
        return api;
      },
      srem: (key, member) => {
        calls.push(() => this.srem(key, member));
        return api;
      },
      zadd: (key, ...entries) => {
        calls.push(() => this.zadd(key, ...entries));
        return api;
      },
      zrem: (key, ...members) => {
        calls.push(() => this.zrem(key, ...members));
        return api;
      },
      exec: async () => {
        const out: unknown[] = [];
        for (const c of calls) out.push(await c());
        return out;
      },
    };
    return api;
  }
}

interface PipelineLike {
  get(key: string): PipelineLike;
  set(
    key: string,
    value: AnyVal,
    opts?: { nx?: boolean; ex?: number },
  ): PipelineLike;
  del(key: string): PipelineLike;
  scard(key: string): PipelineLike;
  sadd(key: string, member: string): PipelineLike;
  srem(key: string, member: string): PipelineLike;
  zadd(
    key: string,
    ...entries: Array<{ score: number; member: string }>
  ): PipelineLike;
  zrem(key: string, ...members: string[]): PipelineLike;
  exec(): Promise<unknown[]>;
}

/** Strip the Upstash lex-bound prefix (`[` / `(`) and return the raw string.
 *  For `(` (exclusive) we currently behave the same as `[` — none of the
 *  tests rely on exclusivity at the boundary. */
function parseLex(bound: string): string {
  if (bound.startsWith("[") || bound.startsWith("(")) return bound.slice(1);
  return bound;
}
