import * as restate from "@restatedev/restate-sdk";
import { Rettiwt } from "rettiwt-api";

import { TWITTER_GATEWAY_GLOBAL_KEY, twitterGateway } from "@/app/twitter_gateway/object.ts";
import { hasStatusCode } from "@/services/rettiwt/utils.ts";
import { WorkflowEnv } from "@/shared/env.ts";

interface TwitterGatewayTurn extends AsyncDisposable {
  waitTurn(): Promise<void>;
  complete(): Promise<void>;
  rateLimited(retryAfterMs?: number): Promise<void>;
  abandon(): Promise<void>;
}

export async function acquireTwitterGatewayTurn(ctx: restate.Context): Promise<TwitterGatewayTurn> {
  const gateway = ctx.objectClient(twitterGateway, TWITTER_GATEWAY_GLOBAL_KEY);
  const { ticket } = await gateway.enqueue();
  let isFinalized = false;

  return {
    waitTurn: async () => {
      const awakeable = ctx.awakeable<void>();
      await gateway.wait_turn({ ticket, awakeableId: awakeable.id });
      await awakeable.promise;
    },
    complete: async () => {
      if (isFinalized) return;
      isFinalized = true;
      await gateway.complete({ ticket });
    },
    rateLimited: async (retryAfterMs?: number) => {
      if (retryAfterMs === undefined) {
        await gateway.rate_limited({ ticket });
        return;
      }
      await gateway.rate_limited({ ticket, retryAfterMs });
    },
    abandon: async () => {
      if (isFinalized) return;
      isFinalized = true;
      await gateway.abandon({ ticket });
    },
    [Symbol.asyncDispose]: async () => {
      if (isFinalized) return;
      isFinalized = true;
      await gateway.abandon({ ticket });
    },
  };
}

export async function runTwitterApi<TResult>(
  ctx: restate.Context,
  name: string,
  block: (client: Rettiwt) => Promise<TResult>,
): Promise<TResult> {
  await using twitterTurn = await acquireTwitterGatewayTurn(ctx);
  const client = new Rettiwt({
    apiKey: WorkflowEnv.RETTIWT_API_KEY,
    maxRetries: 0,
    delay: 0,
  });

  while (true) {
    await twitterTurn.waitTurn();
    try {
      const result = await ctx.run(name, () => block(client), { maxRetryAttempts: 1 });
      await twitterTurn.complete();
      return result;
    } catch (error) {
      if (!hasStatusCode(error, 429)) throw error;

      const seconds = Number.parseInt(
        error.message.match(/retry-?after[^0-9]*(\d+)\s*s/i)?.[1] ?? "",
        10,
      );
      if (Number.isFinite(seconds) && seconds > 0) {
        await twitterTurn.rateLimited(seconds * 1000);
        continue;
      }

      const millis = Number.parseInt(
        error.message.match(/retry-?after[^0-9]*(\d+)\s*ms/i)?.[1] ?? "",
        10,
      );
      if (Number.isFinite(millis) && millis > 0) {
        await twitterTurn.rateLimited(millis);
        continue;
      }

      await twitterTurn.rateLimited();
    }
  }
}
