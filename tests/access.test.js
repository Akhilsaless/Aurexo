import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import worker from "../cloudflare-worker/src/studio.js";
import { issueSession } from "../cloudflare-worker/src/access.js";
function setup() {
  const data = new Map();
  const env = {
    AUREXO_OWNER_PASSWORD: "owner-long-test-password",
    AUREXO_OWNER_EMAIL: "owner@gmail.com",
    AUREXO_ENCRYPTION_KEY: "11".repeat(32),
    GOOGLE_CLIENT_ID: "client-test",
    GOOGLE_CLIENT_SECRET: "not-a-real-secret",
    AUREXO_KV: {
      get: async (k) => data.get(k) || null,
      put: async (k, v) => data.set(k, JSON.parse(v)),
      delete: async (k) => data.delete(k),
      take: async (k) => {
        const v = data.get(k);
        data.delete(k);
        return v;
      },
    },
    CHANGE: async (k, fn) => {
      const v = fn(data.get(k));
      data.set(k, v);
      return v;
    },
  };
  return {
    env,
    data,
    request: (path, method = "GET", body, cookie = "") =>
      worker.fetch(
        new Request("https://studio.test" + path, {
          method,
          headers: {
            origin: "https://studio.test",
            cookie,
            "content-type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
        env,
      ),
  };
}
test("manager can access projects but cannot change integrations, accounts or team; revocation is immediate", async () => {
  const s = setup();
  s.data.set("member:manager@gmail.com", { role: "manager" });
  const cookie = (
    await issueSession(s.env, { email: "manager@gmail.com", role: "owner" })
  ).split(";")[0];
  assert.equal(
    (await s.request("/api/projects", "GET", null, cookie)).status,
    200,
  );
  for (const path of [
    "/api/integrations",
    "/api/social/config",
    "/api/social/connect",
    "/api/team",
  ])
    assert.equal((await s.request(path, "POST", {}, cookie)).status, 403);
  s.data.set("member:manager@gmail.com", { role: null });
  assert.equal(
    (await s.request("/api/projects", "GET", null, cookie)).status,
    401,
  );
});
test("owner approval requires a verified pending request and health reports invalid secrets", async () => {
  const s = setup(),
    cookie = (await issueSession(s.env, { email: "owner@gmail.com" })).split(
      ";",
    )[0];
  assert.equal(
    (
      await s.request(
        "/api/team",
        "POST",
        { action: "approve", email: "other@gmail.com" },
        cookie,
      )
    ).status,
    409,
  );
  s.data.set("access-requests", [{ email: "other@gmail.com" }]);
  assert.equal(
    (
      await s.request(
        "/api/team",
        "POST",
        { action: "approve", email: "other@gmail.com" },
        cookie,
      )
    ).status,
    200,
  );
  s.env.AUREXO_OWNER_PASSWORD = "short";
  s.env.AUREXO_ENCRYPTION_KEY = "invalid";
  const health = await (await s.request("/api/health")).json();
  assert.equal(health.ownerConfigured, false);
  assert.equal(health.encryptionConfigured, false);
});
test("Google callback verifies signature, audience and nonce; unapproved accounts get no project session", async () => {
  const s = setup(),
    originalFetch = globalThis.fetch;
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  let nonce = "",
    email = "new@gmail.com",
    audience = "client-test",
    exchanges = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/certs")) return Response.json({ keys: [jwk] });
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    exchanges++;
    const token = await new SignJWT({ nonce, email, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setSubject("google-id")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    return Response.json({ id_token: token });
  };
  try {
    async function start() {
      const r = await s.request("/api/auth/google/start", "POST", {}),
        b = await r.json(),
        u = new URL(b.url);
      nonce = u.searchParams.get("nonce");
      return {
        state: u.searchParams.get("state"),
        cookie: r.headers.get("set-cookie").split(";")[0],
      };
    }
    let a = await start(),
      r = await s.request(
        "/api/auth/google/callback?code=abc&state=" + a.state,
        "GET",
        null,
        a.cookie,
      );
    assert.equal(r.status, 303);
    assert.match(r.headers.get("location"), /access-pending/);
    assert.equal(s.data.get("access-requests")[0].email, email);
    assert.equal(
      (
        await s.request(
          "/api/auth/google/callback?code=abc&state=" + a.state,
          "GET",
          null,
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(exchanges, 1);
    email = "owner@gmail.com";
    a = await start();
    r = await s.request(
      "/api/auth/google/callback?code=abc&state=" + a.state,
      "GET",
      null,
      a.cookie,
    );
    assert.equal(r.status, 303);
    assert.match(r.headers.get("set-cookie"), /__Host-aurexo-google=/);
    audience = "wrong-client";
    a = await start();
    r = await s.request(
      "/api/auth/google/callback?code=abc&state=" + a.state,
      "GET",
      null,
      a.cookie,
    );
    assert.equal(r.status, 401);
    audience = "client-test";
    a = await start();
    nonce = "wrong-nonce";
    r = await s.request(
      "/api/auth/google/callback?code=abc&state=" + a.state,
      "GET",
      null,
      a.cookie,
    );
    assert.equal(r.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
