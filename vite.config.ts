import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadDevCerts(): { key: Buffer; cert: Buffer } | undefined {
  try {
    const base =
      process.env.APPDATA ?? `${process.env.HOME}/.office-addin-dev-certs`;
    const crt = resolve(base, "localhost.crt");
    const key = resolve(base, "localhost.key");
    if (!existsSync(crt) || !existsSync(key)) return undefined;
    return { key: readFileSync(key), cert: readFileSync(crt) };
  } catch {
    return undefined;
  }
}

const devCerts = loadDevCerts();

if (!devCerts) {
  console.warn(
    "[vite] Dev certificates not found. Run `npm start` (installs certificates) " +
      "before sideloading the add-in. Office requires HTTPS."
  );
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    https: devCerts,
    host: "localhost",
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.SOURCEMAP === "true",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        commands: resolve(__dirname, "commands.html"),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("@fluentui")) return "vendor-fluentui";
            if (
              id.includes("react/") ||
              id.includes("react-dom/") ||
              id.includes("scheduler/")
            ) {
              return "vendor-react";
            }
            if (
              id.includes("i18next") ||
              id.includes("zustand") ||
              id.includes("idb/")
            ) {
              return "vendor-utils";
            }
          }
          return undefined;
        },
      },
    },
  },
  publicDir: "public",
});
