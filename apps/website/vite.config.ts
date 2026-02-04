import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "scheduler"],
  },
  ssr: {
    noExternal: [
      "@sqlrooms/room-shell",
      "@sqlrooms/duckdb",
      "@sqlrooms/ui",
      "@sqlrooms/room-store",
    ],
  },
  optimizeDeps: {
    include: ["@sqlrooms/room-shell", "@sqlrooms/duckdb", "@sqlrooms/ui"],
  },
});
