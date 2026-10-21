import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { seal } from "../cloudflare-worker/src/studio.js";
import { runDueJobs } from "../cloudflare-worker/src/production.js";
const plan = {
  script: {
    hook: "Look at the sky",
    body: "Let us learn about rainbows.",
    cta: "Name a color.",
  },
  scenes: [{ visual: "A rainbow", narration: "Let us learn about rainbows." }],
  variants: Object.fromEntries(
    ["youtube", "instagram", "facebook"].map((k) => [
      k,
      { title: "Rainbows", caption: "Learning about colors" },
    ]),
  ),
  reviewFlags: [],
};
function fixture() {
  const store = new Map(),
    media = new Map();
  const env = {
    AUREXO_OWNER_PASSWORD: "a-long-owner-test-password",
    AUREXO_ENCRYPTION_KEY: "11".repeat(32),
    AUREXO_ALLOWED_ORIGIN: "https://studio.test",
    AUREXO_KV: {
      get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
    },
    MEDIA: {
      put: async (k, v, opts) => {
        media.set(k, {
          bytes: new Uint8Array(v),
          httpMetadata: opts.httpMetadata,
        });
        return {};
      },
      head: async (k) => {
        const m = media.get(k);
        return m
          ? { size: m.bytes.length, httpMetadata: m.httpMetadata }
          : null;
      },
      get: async (k, options = {}) => {
        const m = media.get(k);
        if (!m) return null;
        const b = options.range
          ? m.bytes.slice(
              options.range.offset,
              options.range.offset + options.range.length,
            )
          : m.bytes;
        return { body: new Blob([b]).stream() };
      },
    },
    SCHEDULE: async () => {},
  };
  let cookie;
  const req = async (path, method = "GET", b, headers = {}) =>
    worker.fetch(
      new Request("https://studio.test" + path, {
        method,
        headers: {
          origin: "https://studio.test",
          ...(cookie ? { cookie } : {}),
          ...(b ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: b ? JSON.stringify(b) : undefined,
      }),
      env,
    );
  return {
    env,
    store,
    media,
    req,
    async login() {
      const r = await req("/api/session", "POST", {
        password: env.AUREXO_OWNER_PASSWORD,
      });
      cookie = r.headers.get("set-cookie").split(";")[0];
    },
    async seed() {
      const p = {
        id: "project-1",
        title: "Rainbows",
        createdAt: new Date().toISOString(),
        mode: "kids",
        state: "approved",
        notes: "Source notes",
        audit: [],
        plan,
      };
      store.set("projects", JSON.stringify([p]));
      return p;
    },
    async token() {
      store.set(
        "social-token:youtube",
        JSON.stringify(
          await seal(env, {
            access_token: "test-access-token",
            expiresAt: Date.now() + 86400000,
          }),
        ),
      );
    },
    upload: async () =>
      worker.fetch(
        new Request(
          "https://studio.test/api/media/upload?projectId=project-1&kind=video",
          {
            method: "POST",
            headers: {
              origin: "https://studio.test",
              cookie,
              "content-type": "video/mp4",
              "content-length": "12",
            },
            body: new Uint8Array([
              0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109,
            ]),
          },
        ),
        env,
      ),
  };
}
async function approve(f) {
  const p = (await (await f.req("/api/projects")).json()).projects[0];
  const r = await f.req("/api/media/approve", "POST", {
    projectId: p.id,
    mediaKey: p.media.key,
    checks: {
      facts: true,
      rights: true,
      media: true,
      audience: true,
      disclosure: true,
    },
  });
  assert.equal(r.status, 200);
  return (await r.json()).projects[0];
}
test("stale revision cannot overwrite another client’s projects", async () => {
  const f = fixture();
  await f.login();
  const p = await f.seed();
  assert.equal(
    (await f.req("/api/projects", "PUT", { projects: [p], revision: 0 }))
      .status,
    200,
  );
  assert.equal(
    (await f.req("/api/projects", "PUT", { projects: [], revision: 0 })).status,
    409,
  );
  assert.equal(
    (await (await f.req("/api/projects")).json()).projects.length,
    1,
  );
});
test("publishing requires actual uploaded media plus exact final approval", async () => {
  const f = fixture();
  await f.login();
  await f.seed();
  await f.token();
  assert.equal(
    (
      await f.req("/api/publish/jobs", "POST", {
        projectId: "project-1",
        platform: "youtube",
        confirmPublish: true,
      })
    ).status,
    409,
  );
  assert.equal((await f.upload()).status, 200);
  assert.equal(
    (
      await f.req("/api/publish/jobs", "POST", {
        projectId: "project-1",
        platform: "youtube",
        confirmPublish: true,
      })
    ).status,
    409,
  );
  await approve(f);
  const first = await (
    await f.req("/api/publish/jobs", "POST", {
      projectId: "project-1",
      platform: "youtube",
      confirmPublish: true,
    })
  ).json();
  const second = await (
    await f.req("/api/publish/jobs", "POST", {
      projectId: "project-1",
      platform: "youtube",
      confirmPublish: true,
    })
  ).json();
  assert.equal(first.job.id, second.job.id);
  assert.equal(second.deduplicated, true);
});
test("editing a reviewed script revokes final approval and blocks the scheduled job", async () => {
  const f = fixture();
  await f.login();
  await f.seed();
  await f.token();
  await f.upload();
  await approve(f);
  await f.req("/api/publish/jobs", "POST", {
    projectId: "project-1",
    platform: "youtube",
    confirmPublish: true,
  });
  const snap = await (await f.req("/api/projects")).json();
  snap.projects[0].plan.script.body = "A changed claim";
  const r = await f.req("/api/projects", "PUT", snap);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).projects[0].finalApproval, null);
  await runDueJobs(f.env);
  assert.equal(JSON.parse(f.store.get("jobs"))[0].state, "needs_attention");
});
test("owner cannot forge final-media approval through generic project saving", async () => {
  const f = fixture();
  await f.login();
  const p = await f.seed();
  p.media = { key: "invented" };
  p.finalApproval = { mediaKey: "invented", planJSON: JSON.stringify(p.plan) };
  const r = await f.req("/api/projects", "PUT", { projects: [p], revision: 0 });
  assert.equal(r.status, 200);
  const saved = (await r.json()).projects[0];
  assert.equal(saved.media, undefined);
  assert.equal(saved.finalApproval, undefined);
});
test("OAuth callback state is single-use and invalid states never exchange tokens", async () => {
  const f = fixture();
  await f.login();
  assert.equal(
    (await f.req("/api/oauth/youtube/callback?state=unknown&code=bad")).status,
    400,
  );
});
test("interrupted upload resumes its session instead of creating a second video", async () => {
  const f = fixture();
  await f.login();
  await f.seed();
  await f.token();
  await f.upload();
  await approve(f);
  await f.req("/api/publish/jobs", "POST", {
    projectId: "project-1",
    platform: "youtube",
    confirmPublish: true,
  });
  const original = globalThis.fetch;
  let initCalls = 0,
    uploads = 0;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("uploadType=resumable")) {
      initCalls++;
      return new Response(null, {
        status: 200,
        headers: { location: "https://www.googleapis.com/upload/session-test" },
      });
    }
    if (String(url).includes("/upload/session-test")) {
      if (opts.headers["content-range"].startsWith("bytes */"))
        return new Response(null, { status: 308 });
      uploads++;
      return Response.json({ id: "confirmed-id" });
    }
    if (String(url).includes("/youtube/v3/videos?"))
      return Response.json({
        items: [
          {
            id: "confirmed-id",
            status: { uploadStatus: "processed", privacyStatus: "unlisted" },
          },
        ],
      });
    throw Error("Unexpected external call");
  };
  try {
    await runDueJobs(f.env);
    let jobs = JSON.parse(f.store.get("jobs"));
    jobs[0].nextRun = Date.now() - 1;
    f.store.set("jobs", JSON.stringify(jobs));
    await runDueJobs(f.env);
    jobs = JSON.parse(f.store.get("jobs"));
    assert.equal(jobs[0].state, "processing");
    jobs[0].nextRun = Date.now() - 1;
    f.store.set("jobs", JSON.stringify(jobs));
    await runDueJobs(f.env);
    assert.equal(JSON.parse(f.store.get("jobs"))[0].state, "published");
    assert.equal(initCalls, 1);
    assert.equal(uploads, 1);
  } finally {
    globalThis.fetch = original;
  }
});
