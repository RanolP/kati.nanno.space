/* eslint-disable unicorn/filename-case */

import * as restate from "@restatedev/restate-sdk";

export const TWITTER_GATEWAY_GLOBAL_KEY = "global";
const NEXT_TICKET_KEY = "twitter-gateway:next-ticket";
const CURRENT_TICKET_KEY = "twitter-gateway:current-ticket";
const BLOCKED_UNTIL_KEY = "twitter-gateway:blocked-until";
const WAITER_KEY_PREFIX = "twitter-gateway:waiter:";
const MIN_RETRY_AFTER_MS = 60_000;

export interface EnqueueResult {
  readonly ticket: number;
}

export interface WaitTurnInput {
  readonly ticket: number;
  readonly awakeableId: string;
}

export interface TicketInput {
  readonly ticket: number;
}

export interface RateLimitedInput extends TicketInput {
  readonly retryAfterMs?: number;
}

export const twitterGateway = restate.object({
  name: "TwitterGateway",
  handlers: {
    enqueue: restate.handlers.object.exclusive(async (ctx): Promise<EnqueueResult> => {
      const nextTicket = await readNumberState(ctx, NEXT_TICKET_KEY, 0);
      ctx.set(NEXT_TICKET_KEY, nextTicket + 1);
      return { ticket: nextTicket };
    }),
    wait_turn: restate.handlers.object.exclusive(async (ctx, input: WaitTurnInput) => {
      const now = await ctx.date.now();
      const currentTicket = await readNumberState(ctx, CURRENT_TICKET_KEY, 0);

      if (input.ticket < currentTicket) {
        ctx.resolveAwakeable(input.awakeableId);
        return;
      }

      if (input.ticket > currentTicket) {
        ctx.set(waiterStateKey(input.ticket), input.awakeableId);
        return;
      }

      const blockedUntil = await readNumberState(ctx, BLOCKED_UNTIL_KEY, 0);
      if (now < blockedUntil) {
        ctx.set(waiterStateKey(input.ticket), input.awakeableId);
        await scheduleWakeIfBlocked(ctx, now, blockedUntil);
        return;
      }

      ctx.resolveAwakeable(input.awakeableId);
    }),
    complete: restate.handlers.object.exclusive(async (ctx, input: TicketInput) =>
      advanceTicket(ctx, input.ticket),
    ),
    abandon: restate.handlers.object.exclusive(async (ctx, input: TicketInput) =>
      advanceTicket(ctx, input.ticket),
    ),
    rate_limited: restate.handlers.object.exclusive(async (ctx, input: RateLimitedInput) => {
      const currentTicket = await readNumberState(ctx, CURRENT_TICKET_KEY, 0);
      if (input.ticket !== currentTicket) return;

      const now = await ctx.date.now();
      const retryAfterMs = normalizeRetryAfterMs(input.retryAfterMs);
      const blockedUntil = now + retryAfterMs;
      ctx.set(BLOCKED_UNTIL_KEY, blockedUntil);
      await scheduleWakeIfBlocked(ctx, now, blockedUntil);
    }),
    wake_if_ready: restate.handlers.object.exclusive(async (ctx) => {
      const now = await ctx.date.now();
      await wakeCurrentTicketIfReady(ctx, now);
    }),
  },
});

async function wakeCurrentTicketIfReady(ctx: restate.ObjectContext, now: number): Promise<void> {
  const blockedUntil = await readNumberState(ctx, BLOCKED_UNTIL_KEY, 0);
  if (now < blockedUntil) {
    await scheduleWakeIfBlocked(ctx, now, blockedUntil);
    return;
  }

  if (blockedUntil !== 0) {
    ctx.set(BLOCKED_UNTIL_KEY, 0);
  }

  const currentTicket = await readNumberState(ctx, CURRENT_TICKET_KEY, 0);
  const currentWaiterKey = waiterStateKey(currentTicket);
  const awakeableId = await ctx.get<string>(currentWaiterKey);
  if (awakeableId === null) return;

  ctx.clear(currentWaiterKey);
  ctx.resolveAwakeable(awakeableId);
}

async function scheduleWakeIfBlocked(
  ctx: restate.ObjectContext,
  now: number,
  blockedUntil: number,
): Promise<void> {
  const delay = Math.max(0, blockedUntil - now);
  if (delay === 0) {
    await wakeCurrentTicketIfReady(ctx, now);
    return;
  }

  ctx
    .objectSendClient(twitterGateway, TWITTER_GATEWAY_GLOBAL_KEY, {
      delay,
    })
    .wake_if_ready();
}

function normalizeRetryAfterMs(retryAfterMs: number | undefined): number {
  if (retryAfterMs === undefined) return MIN_RETRY_AFTER_MS;
  if (!Number.isFinite(retryAfterMs)) return MIN_RETRY_AFTER_MS;
  if (retryAfterMs <= 0) return MIN_RETRY_AFTER_MS;
  return Math.max(MIN_RETRY_AFTER_MS, Math.floor(retryAfterMs));
}

async function readNumberState(
  ctx: restate.ObjectContext,
  key: string,
  defaultValue: number,
): Promise<number> {
  const storedValue = await ctx.get<number>(key);
  return storedValue === null ? defaultValue : storedValue;
}

function waiterStateKey(ticket: number): string {
  return `${WAITER_KEY_PREFIX}${ticket}`;
}

async function advanceTicket(ctx: restate.ObjectContext, ticket: number): Promise<void> {
  const currentTicket = await readNumberState(ctx, CURRENT_TICKET_KEY, 0);
  if (ticket !== currentTicket) return;

  ctx.clear(waiterStateKey(ticket));
  ctx.set(CURRENT_TICKET_KEY, currentTicket + 1);

  const now = await ctx.date.now();
  await wakeCurrentTicketIfReady(ctx, now);
}
