import { Ok, task, TaskContext, work, yieldTask } from "../features/task/index.ts";
import type { Infer } from "../features/model/index.ts";
import type { Task } from "../features/task/index.ts";
import {
  circleCollection,
  concertCollection,
  eventCollection,
  ongoingBoothInfoCollection,
  scheduleCollection,
} from "./models/illustar.ts";
import {
  circleList,
  concertList,
  eventList,
  ongoingBoothInfo,
  schedule,
} from "@kati/illustar-api/endpoints";
import { toMap } from "../shared/collection.ts";

export const crawlEvents = (): Task<Infer<typeof eventCollection>> =>
  task(
    "crawl-illustar-events",
    function* () {
      const { fetcher } = yield* TaskContext();
      const { eventInfo } = yield* work(async ($) => {
        $.description("Fetching event list");
        return await fetcher.fetch(eventList);
      });

      return Ok(toMap(eventInfo, (e) => [e.id]) as Infer<typeof eventCollection>);
    },
    { persist: { model: eventCollection, name: "events" } },
  );

export const crawlOngoingBoothInfo = (): Task<Infer<typeof ongoingBoothInfoCollection>> =>
  task(
    "crawl-illustar-ongoing-booth-info",
    function* () {
      const { fetcher } = yield* TaskContext();
      const { boothInfo } = yield* work(async ($) => {
        $.description("Fetching ongoing booth info");
        return await fetcher.fetch(ongoingBoothInfo);
      });

      return Ok(toMap(boothInfo, (b) => [b.id]) as Infer<typeof ongoingBoothInfoCollection>);
    },
    {
      persist: {
        model: ongoingBoothInfoCollection,
        name: "ongoing-booth-info",
      },
    },
  );

export const crawlCircles = (): Task<Infer<typeof circleCollection>> =>
  task(
    "crawl-illustar-circles",
    function* () {
      const { fetcher } = yield* TaskContext();
      const ongoingEvents = yield* yieldTask(crawlOngoingBoothInfo());

      const allCircles: Infer<typeof circleCollection> = new Map();

      for (const [, boothInfo] of ongoingEvents) {
        const ongoingBoothInfoId = boothInfo.id;
        let page = 1;
        const rowPerPage = 100;

        while (true) {
          const response = yield* work(async ($) => {
            $.description(`Fetching circles for booth info ${ongoingBoothInfoId}, page ${page}`);
            return await fetcher.fetch(circleList, {
              query: { event_id: ongoingBoothInfoId, page, row_per_page: rowPerPage },
            });
          });

          for (const circle of response.list) {
            allCircles.set([circle.id].join("\0"), circle);
          }

          if (page >= response.pageInfo.max_page) break;
          page += 1;
        }
      }

      return Ok(allCircles);
    },
    { persist: { model: circleCollection, name: "circles" } },
  );

export const crawlConcerts = (): Task<Infer<typeof concertCollection>> =>
  task(
    "crawl-illustar-concerts",
    function* () {
      const { fetcher } = yield* TaskContext();
      const allConcerts: Infer<typeof concertCollection> = new Map();
      let page = 1;
      const rowPerPage = 100;

      while (true) {
        const response = yield* work(async ($) => {
          $.description(`Fetching concerts, page ${page}`);
          return await fetcher.fetch(concertList, {
            query: { page, row_per_page: rowPerPage },
          });
        });

        for (const concert of response.list) {
          const key = [concert.id];
          allConcerts.set(key.join("\0"), concert);
        }

        if (page >= response.pageInfo.max_page) break;
        page += 1;
      }

      return Ok(allConcerts);
    },
    { persist: { model: concertCollection, name: "concerts" } },
  );

export const crawlSchedule = (): Task<Infer<typeof scheduleCollection>> =>
  task(
    "crawl-illustar-schedule",
    function* () {
      const { fetcher } = yield* TaskContext();
      const { scheduleList } = yield* work(async ($) => {
        $.description("Fetching schedule");
        return await fetcher.fetch(schedule);
      });

      return Ok(toMap(scheduleList, (s) => [s.id]) as Infer<typeof scheduleCollection>);
    },
    { persist: { model: scheduleCollection, name: "schedule" } },
  );

export const illustarTasks = [
  crawlEvents,
  crawlOngoingBoothInfo,
  crawlCircles,
  crawlConcerts,
  crawlSchedule,
];
