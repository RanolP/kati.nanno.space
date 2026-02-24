import type * as restate from "@restatedev/restate-sdk";

interface CachedValue<TValue> {
  readonly storedAt: number;
  readonly expiresAt: number;
  readonly value: TValue;
}

export interface ObjectCacheOptions {
  readonly namespace: string;
  readonly key: string;
  readonly ttlMs: number;
  readonly retentionMs: number;
  readonly sweepIntervalMs: number;
  readonly jitterRatio?: number;
}

export async function withObjectCache<TValue>(
  ctx: restate.ObjectContext,
  options: ObjectCacheOptions,
  load: () => Promise<TValue>,
): Promise<TValue> {
  const now = await ctx.date.now();
  await sweepObjectCache(ctx, options, now);

  const valueStateKey = cacheValueStateKey(options.namespace, options.key);
  const cached = await ctx.get<CachedValue<TValue>>(valueStateKey);
  if (cached !== null && cached.expiresAt > now) return cached.value;

  const value = await load();
  const jitterRatio = options.jitterRatio ?? 0;
  const jitterWindowMs = options.ttlMs * jitterRatio;
  const jitterMs = (ctx.rand.random() * 2 - 1) * jitterWindowMs;
  const expiresAt = now + Math.round(options.ttlMs + jitterMs);
  ctx.set(valueStateKey, { storedAt: now, expiresAt, value });
  return value;
}

async function sweepObjectCache(
  ctx: restate.ObjectContext,
  options: ObjectCacheOptions,
  now: number,
): Promise<void> {
  const sweepStateKey = lastSweepStateKey(options.namespace);
  const lastSweepAt = await ctx.get<number>(sweepStateKey);
  if (lastSweepAt !== null && now - lastSweepAt < options.sweepIntervalMs) return;

  const valuePrefix = cacheValuePrefix(options.namespace);
  const keys = await ctx.stateKeys();
  for (const key of keys) {
    if (!key.startsWith(valuePrefix)) continue;

    const cachedValue = await ctx.get<CachedValue<unknown>>(key);
    if (cachedValue === null) continue;
    if (now - cachedValue.storedAt < options.retentionMs) continue;
    ctx.clear(key);
  }

  ctx.set(sweepStateKey, now);
}

function cacheValuePrefix(namespace: string): string {
  return `${namespace}:cache:`;
}

function cacheValueStateKey(namespace: string, key: string): string {
  return `${cacheValuePrefix(namespace)}${key}`;
}

function lastSweepStateKey(namespace: string): string {
  return `${namespace}:last-sweep-at`;
}
