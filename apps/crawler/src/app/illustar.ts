import { action, run, step, useContext } from "../features/action/index.ts";
import type { ActionContext } from "../features/action/index.ts";
import {
  circleCollection,
  concertCollection,
  eventCollection,
  scheduleCollection,
} from "./models/illustar.ts";
import type { ActionEntry } from "./types.ts";
import type { Infer } from "../features/model/index.ts";
import { endpoints } from "../services/illustar/index.ts";
import { persist } from "./persist.ts";

function toMap<T, K extends readonly [string | number, ...(string | number)[]]>(
  items: T[],
  keyFn: (item: T) => K,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item).join("\0"), item);
  }
  return map;
}

const crawlEvents = action("crawl-illustar-events", function* crawlEvents() {
  const { fetcher } = yield* useContext();
  const { eventInfo } = yield* step(() => fetcher.fetch(endpoints.eventList), {
    name: "fetch-event-list",
  });

  return toMap(eventInfo, (e) => [e.id] as const) as Infer<typeof eventCollection>;
});

const crawlCircles = action("crawl-illustar-circles", function* crawlCircles() {
  const { fetcher } = yield* useContext();
  const { eventInfo } = yield* step(() => fetcher.fetch(endpoints.eventList), {
    name: "fetch-event-list",
  });

  const allCircles: Infer<typeof circleCollection> = new Map();

  for (const event of eventInfo) {
    let page = 1;
    const rowPerPage = 100;

    while (true) {
      const response = yield* step(
        () =>
          fetcher.fetch(endpoints.circleList, {
            query: { event_id: event.id, page, row_per_page: rowPerPage },
          }),
        { name: `fetch-circles-event-${event.id}-page-${page}` },
      );

      for (const circle of response.list) {
        const key = [circle.id] as const;
        allCircles.set(key.join("\0"), circle);
      }

      if (page >= response.pageInfo.max_page) break;
      page += 1;
    }
  }

  return allCircles;
});

const crawlConcerts = action("crawl-illustar-concerts", function* crawlConcerts() {
  const { fetcher } = yield* useContext();
  const allConcerts: Infer<typeof concertCollection> = new Map();
  let page = 1;
  const rowPerPage = 100;

  while (true) {
    const response = yield* step(
      () =>
        fetcher.fetch(endpoints.concertList, {
          query: { page, row_per_page: rowPerPage },
        }),
      { name: `fetch-concerts-page-${page}` },
    );

    for (const concert of response.list) {
      const key = [concert.id] as const;
      allConcerts.set(key.join("\0"), concert);
    }

    if (page >= response.pageInfo.max_page) break;
    page += 1;
  }

  return allConcerts;
});

const crawlSchedule = action("crawl-illustar-schedule", function* crawlSchedule() {
  const { fetcher } = yield* useContext();
  const { scheduleList } = yield* step(() => fetcher.fetch(endpoints.schedule), {
    name: "fetch-schedule",
  });

  return toMap(scheduleList, (s) => [s.id] as const) as Infer<typeof scheduleCollection>;
});

export interface IllustarCrawlResult {
  readonly entries: ActionEntry[];
  persist(dataDir: string): Promise<void>;
}

// eslint-disable-next-line import/no-default-export
export default function crawlIllustar(ctx: Partial<ActionContext>): IllustarCrawlResult {
  const eventsResult = run(crawlEvents, ctx);
  const circlesResult = run(crawlCircles, ctx);
  const concertsResult = run(crawlConcerts, ctx);
  const scheduleResult = run(crawlSchedule, ctx);

  const settled = Promise.allSettled([
    eventsResult.result,
    circlesResult.result,
    concertsResult.result,
    scheduleResult.result,
  ]);

  return {
    entries: [
      { name: "crawl-illustar-events", result: eventsResult },
      { name: "crawl-illustar-circles", result: circlesResult },
      { name: "crawl-illustar-concerts", result: concertsResult },
      { name: "crawl-illustar-schedule", result: scheduleResult },
    ],
    async persist(dataDir: string) {
      const [events, circles, concerts, schedule] = await settled;

      if (events.status === "fulfilled") {
        await persist(eventCollection, events.value, "events", dataDir);
      }
      if (circles.status === "fulfilled") {
        await persist(circleCollection, circles.value, "circles", dataDir);
      }
      if (concerts.status === "fulfilled") {
        await persist(concertCollection, concerts.value, "concerts", dataDir);
      }
      if (schedule.status === "fulfilled") {
        await persist(scheduleCollection, schedule.value, "schedule", dataDir);
      }
    },
  };
}
