import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { resolve } from "node:path";
const dist = resolve("dist");
await mkdir(dist, { recursive: true });
await mkdir(resolve(dist, "src"), { recursive: true });
await mkdir(resolve(dist, "tests"), { recursive: true });
await copyFile(
  "tests/browser-assembly.html",
  resolve(dist, "tests/browser-assembly.html"),
);
await copyFile(
  "tests/browser-assembly.js",
  resolve(dist, "tests/browser-assembly.js"),
);
for (const file of [
  "index.html",
  "icon.svg",
  "manifest.webmanifest",
  "src/app.js",
  "src/styles.css",
  "src/domain.js",
  "src/integration-registry.js",
  "src/validation.js",
  "src/profiles.js",
  "src/quality.js",
  "src/migration.js",
  "src/media.js",
  "src/assemble.js",
  "src/animation-ui.js",
  "src/production-ui.js",
])
  await copyFile(file, resolve(dist, file));
const bundled = await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const js = bundled.outputFiles[0].contents;
const hash = createHash("sha256").update(js).digest("hex").slice(0, 16);
await mkdir(resolve(dist, "assets"), { recursive: true });
await writeFile(resolve(dist, `assets/app-${hash}.js`), js);
const css = await readFile("src/styles.css");
const cssHash = createHash("sha256").update(css).digest("hex").slice(0, 16);
await writeFile(resolve(dist, `assets/styles-${cssHash}.css`), css);
const html = (await readFile("index.html", "utf8"))
  .replace(/\.\/src\/app\.js[^"']*/, `./assets/app-${hash}.js`)
  .replace(/\.\/src\/styles\.css[^"']*/, `./assets/styles-${cssHash}.css`);
await writeFile(resolve(dist, "index.html"), html);
console.log(
  "Static production assets built in dist/ with content-hashed browser assets",
);
