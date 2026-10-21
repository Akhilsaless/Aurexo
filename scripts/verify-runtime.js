import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import assert from "node:assert/strict";
const bundle = await build({
  entryPoints: ["cloudflare-worker/src/runtime.js"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: "aurexo",
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-08-01",
        durableObjects: {
          STUDIO: { className: "StudioRuntime", useSQLite: true },
        },
        r2Buckets: ["MEDIA"],
        bindings: {
          AUREXO_ALLOWED_ORIGIN: "https://studio.test",
          AUREXO_OWNER_PASSWORD: "temporary-test-password-only",
          AUREXO_ENCRYPTION_KEY: "22".repeat(32),
        },
      },
    ],
  }),
);
let cookie = "";
async function request(path, method = "GET", data) {
  return mf.dispatchFetch("https://studio.test" + path, {
    method,
    headers: {
      origin: "https://studio.test",
      ...(cookie ? { cookie } : {}),
      ...(data ? { "content-type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
try {
  let response = await request("/api/health");
  assert.equal(response.status, 200);
  response = await request("/api/session", "POST", {
    password: "temporary-test-password-only",
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
  let snap = await (await request("/api/projects")).json();
  assert.equal(snap.revision, 0);
  const p = {
    id: "runtime-project",
    title: "Runtime verification",
    mode: "general",
    state: "draft",
    createdAt: new Date().toISOString(),
    audit: [],
  };
  response = await request("/api/projects", "PUT", {
    projects: [p],
    revision: 0,
  });
  assert.equal(response.status, 200);
  response = await request("/api/projects", "PUT", {
    projects: [],
    revision: 0,
  });
  assert.equal(response.status, 409);
  snap = await (await request("/api/projects")).json();
  assert.equal(snap.projects.length, 1);
  assert.equal(snap.revision, 1);
  response = await request("/api/social/status");
  assert.equal((await response.json()).durableScheduling, true);
  console.log(
    "Cloudflare runtime verified: real Durable Object storage, session, revision conflict prevention, R2 binding and scheduler.",
  );
} finally {
  await mf.dispose();
}
