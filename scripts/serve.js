import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve(".");
http
  .createServer(async (req, res) => {
    const path = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (
      !path.startsWith(root + "/") &&
      !path.startsWith(root + "\\") &&
      path !== root
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = await readFile(
        path === root || req.url === "/" ? resolve(root, "index.html") : path,
      );
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".webmanifest": "application/manifest+json",
        }[extname(path)] || "text/html",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("AUREXO preview: http://127.0.0.1:4173"),
  );
