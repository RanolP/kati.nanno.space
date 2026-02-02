import type { LockKey, LockManager } from "./types.ts";

function keyToString(key: LockKey): string {
  return key.join("\0");
}

export function createLockManager(): LockManager {
  const locks = new Map<string, Promise<void>>();

  return {
    async acquire(key: LockKey): Promise<() => void> {
      const serialized = keyToString(key);

      // Wait for any existing lock on this key
      while (locks.has(serialized)) {
        await locks.get(serialized);
      }

      // Create a new lock
      let releaseFn!: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        releaseFn = resolve;
      });
      locks.set(serialized, lockPromise);

      return () => {
        locks.delete(serialized);
        releaseFn();
      };
    },
  };
}
