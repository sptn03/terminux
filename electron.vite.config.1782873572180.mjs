// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["better-sqlite3", "ssh2"] })],
    build: {
      rollupOptions: {
        external: ["better-sqlite3", "ssh2"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer")
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
