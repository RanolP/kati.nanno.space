import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src/app",
  ssr: true,
  async prerender() {
    return ["/"];
  },
} satisfies Config;
