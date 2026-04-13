import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Chrome extension needs multiple separate builds:
// 1. Popup: normal React SPA
// 2. Content script: IIFE bundle (no ES modules in content scripts)
// 3. Background: ES module service worker

const target = process.env.BUILD_TARGET ?? "popup";

const configs = {
  popup: defineConfig({
    plugins: [react()],
    root: resolve(__dirname, "src/popup"),
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, "src/popup/index.html"),
        output: {
          entryFileNames: "popup.js",
          chunkFileNames: "chunks/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  }),

  content: defineConfig({
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/content/index.ts"),
        name: "APS",
        formats: ["iife"],
        fileName: () => "content.js",
      },
      rollupOptions: {
        output: { extend: true },
      },
    },
  }),

  background: defineConfig({
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/background/index.ts"),
        formats: ["es"],
        fileName: () => "background.js",
      },
    },
  }),
};

export default configs[target as keyof typeof configs];
