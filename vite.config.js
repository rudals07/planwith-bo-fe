import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "localhost",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
      },
      "/files": {
        target: "http://localhost:8081",
        changeOrigin: true,
      },
    },
  },
});
