import { dirname, resolve } from "node:path";
import crawlIllustar from "./app/illustar.ts";
import { createFetcher } from "./services/endpoint.ts";
import { fileURLToPath } from "node:url";
import { renderActions } from "./ui.tsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../../data/illustar");

const fetcher = createFetcher();
const illustar = crawlIllustar({ fetcher });

await renderActions(illustar.entries);
await illustar.persist(dataDir);

process.exit(0);
