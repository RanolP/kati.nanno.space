import * as restate from "@restatedev/restate-sdk";
import { crawlerService } from "./app/crawler/service.ts";
import { illustarCrawler } from "./app/illustar-crawler/service.ts";
import { illustarStore } from "./app/illustar-crawler/store.ts";
import { twitterGateway } from "./app/twitter_gateway/object.ts";

restate.serve({
  services: [crawlerService, illustarCrawler, illustarStore, twitterGateway],
});
