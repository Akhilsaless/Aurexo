import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const dist = resolve("dist");
await mkdir(dist, { recursive: true });
await mkdir(resolve(dist, "src"), { recursive: true });
for (const file of [
  "index.html",
  "icon.svg",
  "manifest.webmanifest",
  "src/app.js",
  "src/styles.css",
  "src/domain.js",
  "src/integration-registry.js",
  "src/validation.js",
])
  await copyFile(file, resolve(dist, file));
console.log("Static production assets built in dist/");
