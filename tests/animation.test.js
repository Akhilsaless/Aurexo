import { test } from "node:test";
import assert from "node:assert/strict";
import {
  animationRoute,
  runAnimations,
} from "../cloudflare-worker/src/animation.js";
import { hash } from "../cloudflare-worker/src/access.js";
function setup() {
  const data = new Map(),
    media = new Map();
  const plan = {
    scenes: [
      { visual: "Original friendly robot waves", narration: "Hello explorers" },
    ],
  };
  data.set("projects", [{ id: "test-project", plan }]);
  const env = {
    GEMINI_API_KEY: "test-provider-key",
    GEMINI_MODEL: "text-model",
    MEDIA: { put: async (k, v) => media.set(k, v) },
    AUREXO_KV: { get: async (k) => data.get(k) || null },
    CHANGE: async (k, fn) => {
      const value = fn(structuredClone(data.get(k)));
      data.set(k, value);
      return value;
    },
    SCHEDULE: async () => {},
  };
  const request = (b) =>
    animationRoute(
      env,
      new Request("https://studio.test/api/animation", {
        method: "POST",
        body: JSON.stringify(b),
      }),
      (v, status = 200) => Response.json(v, { status }),
    );
  return { data, env, media, request, plan };
}
test("animation requires consent and active provider; duplicate generation is blocked before billing", async () => {
  const s = setup();
  await assert.rejects(
    s.request({ projectId: "test-project", scene: 0 }),
    /Confirm/,
  );
  const b = { projectId: "test-project", scene: 0, allowUsage: true };
  assert.equal((await s.request(b)).status, 202);
  await assert.rejects(s.request(b), /already has/);
  s.env.AUREXO_DAILY_VIDEO_LIMIT = 0;
  s.data.set("animations", []);
  await assert.rejects(s.request(b), /limit reached/);
});
test("generation persists actual MP4 bytes and fingerprint while interrupted work is never retried", async () => {
  const s = setup(),
    original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(
      String(url),
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    assert.equal(JSON.parse(options.body).response_format.aspect_ratio, "9:16");
    return Response.json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "video",
              mime_type: "video/mp4",
              data: btoa("0000ftyp" + "x".repeat(192)),
            },
          ],
        },
      ],
    });
  };
  try {
    await s.request({ projectId: "test-project", scene: 0, allowUsage: true });
    await runAnimations(s.env);
    const job = s.data.get("animations")[0];
    assert.equal(job.state, "completed");
    assert.equal(job.fingerprint, await hash(JSON.stringify(s.plan)));
    assert.equal(s.media.get(job.media.key).length, 200);
    s.data.set("animations", [{ ...job, state: "running" }]);
    await runAnimations(s.env);
    assert.equal(calls, 1);
    assert.equal(s.data.get("animations")[0].state, "needs_attention");
  } finally {
    globalThis.fetch = original;
  }
});
test("changed plans stop queued jobs before the external provider request", async () => {
  const s = setup();
  await s.request({ projectId: "test-project", scene: 0, allowUsage: true });
  s.plan.scenes[0].visual = "Changed visual";
  await runAnimations(s.env);
  assert.equal(s.data.get("animations")[0].state, "needs_attention");
  assert.equal(s.media.size, 0);
});
