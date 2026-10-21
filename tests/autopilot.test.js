import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autopilotRoute,
  runAutopilot,
} from "../cloudflare-worker/src/autopilot.js";
import { runAnimations } from "../cloudflare-worker/src/animation.js";
import { seal } from "../cloudflare-worker/src/studio.js";
function fixture() {
  const store = new Map(),
    media = new Map();
  const env = {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "text-model",
    AUREXO_ENCRYPTION_KEY: "11".repeat(32),
    ACTOR: { role: "owner", email: "owner@example.com" },
    AUREXO_KV: {
      get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
    },
    CHANGE: async (k, fn) => {
      const next = fn(store.has(k) ? JSON.parse(store.get(k)) : null);
      store.set(k, JSON.stringify(next));
      return next;
    },
    SCHEDULE: async () => {},
    MEDIA: { put: async (k, v) => media.set(k, v) },
  };
  const call = (path, b) =>
    autopilotRoute(
      env,
      new Request("https://studio.test/api/autopilot" + path, {
        method: b ? "POST" : "GET",
        body: b ? JSON.stringify(b) : undefined,
      }),
      (data, status = 200) => Response.json(data, { status }),
    );
  const value = (k) => (store.has(k) ? JSON.parse(store.get(k)) : null);
  return { env, store, media, call, value };
}
test("automatic production creates an AI idea and three clips, then requires exact human approval before upload", async () => {
  const f = fixture(),
    original = globalThis.fetch;
  f.store.set(
    "social-token:youtube",
    JSON.stringify(
      await seal(f.env, {
        accountId: "target-channel",
        accountName: "Test channel",
        access_token: "test-token",
        expiresAt: Date.now() + 86400000,
      }),
    ),
  );
  const start = {
    requestId: "test-request-123",
    mode: "kids",
    channelSlot: "general",
    accountId: "target-channel",
    allowUsage: true,
  };
  await assert.rejects(
    f.call("/start", { ...start, allowUsage: false }),
    /Authorize/,
  );
  await assert.rejects(
    f.call("/start", { ...start, accountId: "wrong" }),
    /channel changed/,
  );
  assert.equal((await f.call("/start", start)).status, 202);
  assert.equal((await f.call("/start", start)).status, 202);
  assert.equal(f.value("autopilot").length, 1);
  let textCalls = 0,
    videoCalls = 0;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("chat/completions")) {
      textCalls++;
      const plan = {
        title: "Nova learns to share",
        script: {
          hook: "Hello",
          body: "Nova shares a toy.",
          cta: "A happy ending.",
        },
        scenes: [0, 1, 2].map((i) => ({
          visual: "Nova and an original toy " + i,
          narration: "Nova shares a toy.",
        })),
        variants: Object.fromEntries(
          ["youtube", "instagram", "facebook"].map((k) => [
            k,
            {
              title: "Nova shares",
              caption: "Original fictional animated story.",
            },
          ]),
        ),
        reviewFlags: ["Human review required"],
      };
      return Response.json({
        choices: [{ message: { content: JSON.stringify(plan) } }],
      });
    }
    videoCalls++;
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
    await runAutopilot(f.env);
    for (let i = 0; i < 3; i++) {
      await runAutopilot(f.env);
      await runAnimations(f.env);
    }
    await runAutopilot(f.env);
    assert.equal(textCalls, 1);
    assert.equal(videoCalls, 3);
    let run = f.value("autopilot")[0];
    assert.equal(run.state, "clips_ready");
    assert.equal(run.clips.length, 3);
    assert.equal(f.value("jobs"), null);
    const claim = await (await f.call("/assembly", { id: run.id })).json();
    await assert.rejects(f.call("/assembly", { id: run.id }), /Another tab/);
    const projects = f.value("projects");
    projects[0].media = {
      key: "finished-video",
      type: "video/mp4",
      size: 200,
      sha256: "media-hash",
    };
    f.store.set("projects", JSON.stringify(projects));
    await assert.rejects(
      f.call("/assembled", {
        id: run.id,
        lease: "wrong",
        mediaKey: "finished-video",
      }),
      /Assembly changed/,
    );
    await f.call("/assembled", {
      id: run.id,
      lease: claim.lease,
      mediaKey: "finished-video",
    });
    assert.equal(f.value("autopilot")[0].state, "review");
    assert.equal(f.value("projects")[0].state, "review");
    assert.equal(f.value("jobs"), null);
    await assert.rejects(
      f.call("/approve", { id: run.id, mediaKey: "finished-video" }),
      /final review/,
    );
    const approved = await f.call("/approve", {
      id: run.id,
      mediaKey: "finished-video",
      checks: {
        facts: true,
        rights: true,
        media: true,
        audience: true,
        disclosure: true,
      },
    });
    assert.equal(approved.status, 200);
    assert.equal(f.value("jobs").length, 1);
    assert.equal(f.value("jobs")[0].accountId, "target-channel");
    assert.equal(f.value("jobs")[0].channelSlot, "general");
    assert.equal(f.value("jobs")[0].privacy, "unlisted");
    await f.call("/approve", {
      id: run.id,
      mediaKey: "finished-video",
      checks: {
        facts: true,
        rights: true,
        media: true,
        audience: true,
        disclosure: true,
      },
    });
    assert.equal(f.value("jobs").length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
