import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare-worker/src/studio.js";
function setup() {
  const data = new Map();
  const env = {
    AUREXO_ALLOWED_ORIGIN: "https://studio.test",
    AUREXO_OWNER_PASSWORD: "owner-password-long-enough",
    AUREXO_ENCRYPTION_KEY: "12".repeat(32),
    AUREXO_KV: {
      get: async (k) => (data.has(k) ? JSON.parse(data.get(k)) : null),
      put: async (k, v) => data.set(k, v),
      delete: async (k) => data.delete(k),
    },
  };
  let cookie = "";
  return {
    env,
    data,
    async request(path, method = "GET", body, origin = "https://studio.test") {
      return worker.fetch(
        new Request("https://studio.test" + path, {
          method,
          headers: {
            origin,
            ...(cookie ? { cookie } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
        env,
      );
    },
    async login() {
      const r = await this.request("/api/session", "POST", {
        password: env.AUREXO_OWNER_PASSWORD,
      });
      assert.equal(r.status, 200);
      cookie = r.headers.get("set-cookie").split(";")[0];
      return r;
    },
  };
}
test("all private endpoints reject unauthenticated requests including legacy proxy", async () => {
  const s = setup();
  for (const path of [
    "/api/integrations",
    "/api/projects",
    "/api/ai/generate",
    "/api/social/status",
  ])
    assert.equal((await s.request(path)).status, 401);
});
test("CORS rejects hostile origins and mutations without origin", async () => {
  const s = setup();
  assert.equal(
    (await s.request("/api/session", "POST", {}, "https://evil.test")).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://studio.test/api/session", { method: "POST" }),
        s.env,
      )
    ).status,
    403,
  );
});
test("session cookie is secure and logout revokes server session", async () => {
  const s = setup(),
    r = await s.login();
  assert.match(
    r.headers.get("set-cookie"),
    /Secure; HttpOnly; SameSite=Strict/,
  );
  assert.equal((await s.request("/api/integrations")).status, 200);
  await s.request("/api/session", "DELETE");
  assert.equal((await s.request("/api/integrations")).status, 401);
});
test("invalid credentials are rate limited", async () => {
  const s = setup();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await s.request("/api/session", "POST", { password: "wrong" })).status,
      401,
    );
  assert.equal(
    (await s.request("/api/session", "POST", { password: "wrong" })).status,
    429,
  );
});
test("provider keys are tested, encrypted and never exposed in status", async () => {
  const s = setup();
  await s.login();
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: "OK" } }] });
  try {
    const key = "test-secret-key-never-expose";
    let r = await s.request("/api/integrations", "POST", {
      provider: "gemini",
      key,
      model: "test-model",
      allowUsage: true,
    });
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify([...s.data]).includes(key));
    r = await s.request("/api/integrations");
    const text = await r.text();
    assert.ok(!text.includes(key));
    assert.equal(JSON.parse(text).providers[1].active, true);
    await s.request("/api/integrations", "DELETE", { provider: "gemini" });
    assert.equal(
      (await (await s.request("/api/integrations")).json()).providers[1].active,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("failed connection test does not activate or leak provider errors", async () => {
  const s = setup();
  await s.login();
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: { message: "secret-leak" } }, { status: 401 });
  try {
    const r = await s.request("/api/integrations", "POST", {
      provider: "openai",
      key: "test-secret-key",
      model: "test-model",
      allowUsage: true,
    });
    assert.equal(r.status, 502);
    assert.ok(!(await r.text()).includes("secret-leak"));
    assert.equal(s.data.has("integration:openai"), false);
  } finally {
    globalThis.fetch = original;
  }
});
test("generation requires explicit usage consent and an active provider", async () => {
  const s = setup();
  await s.login();
  assert.equal(
    (
      await s.request("/api/campaign/generate", "POST", {
        provider: "openai",
        topic: "Rainbows",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await s.request("/api/campaign/generate", "POST", {
        provider: "openai",
        topic: "Rainbows",
        allowUsage: true,
      })
    ).status,
    409,
  );
});
test("malformed provider output cannot become a review-ready project", async () => {
  const s = setup();
  await s.login();
  s.env.OPENAI_API_KEY = "test-key";
  s.env.OPENAI_MODEL = "test-model";
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: "{}" } }] });
  try {
    assert.equal(
      (
        await s.request("/api/campaign/generate", "POST", {
          provider: "openai",
          topic: "Rainbows",
          allowUsage: true,
        })
      ).status,
      502,
    );
    assert.equal(s.data.has("projects"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("static assets retain their body and receive security headers", async () => {
  const response = await worker.fetch(new Request("https://studio.test/"), {
    ASSETS: {
      fetch: async () =>
        new Response("<html>AUREXO</html>", {
          headers: { "content-type": "text/html" },
        }),
    },
  });
  assert.equal(await response.text(), "<html>AUREXO</html>");
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});

test("valid Kids plan is saved for review without claiming media production", async () => {
  const s = setup();
  await s.login();
  s.env.GEMINI_API_KEY = "test-key";
  s.env.GEMINI_MODEL = "test-model";
  const plan = {
    script: {
      hook: "Look up!",
      body: "Let us learn about rainbows.",
      cta: "What colors can you name?",
    },
    scenes: [
      {
        visual: "Original rainbow illustration",
        narration: "Look at these colors.",
      },
    ],
    reviewFlags: ["Adult review required"],
    variants: Object.fromEntries(
      ["youtube", "instagram", "facebook"].map((p) => [
        p,
        { title: "Rainbows", caption: "Learn about colors" },
      ]),
    ),
  };
  let prompt = "";
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    prompt = JSON.parse(init.body).messages[0].content;
    return Response.json({
      choices: [{ message: { content: JSON.stringify(plan) } }],
    });
  };
  try {
    const r = await s.request("/api/campaign/generate", "POST", {
      provider: "gemini",
      topic: "Rainbows",
      mode: "kids",
      age: "6–8",
      allowUsage: true,
    });
    assert.equal(r.status, 200);
    const { project } = await r.json();
    assert.equal(project.state, "review");
    assert.equal(project.mode, "kids");
    assert.equal(project.assets, undefined);
    assert.match(prompt, /Kids mode/);
    assert.match(prompt, /Never claim you browsed/);
    assert.equal(
      (await (await s.request("/api/projects")).json()).projects.length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});
