import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const directory of ["src", "cloudflare-worker/src", "scripts", "tests"])
  for (const entry of await readdir(directory)) {
    if (!entry.endsWith(".js")) continue;
    const result = spawnSync(
      process.execPath,
      ["--check", directory + "/" + entry],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
console.log("All JavaScript syntax checks passed.");
