import { createRemoteJWKSet, jwtVerify } from "jose";
const keys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const encoder = new TextEncoder();
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const error = (status, message) =>
  Object.assign(new Error(message), { status });
const cookie = (req, name) =>
  (req.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
const ownerEmail = (env) => (env.AUREXO_OWNER_EMAIL || "").trim().toLowerCase();
const read = (env, key) => env.AUREXO_KV.get(key, "json");
export async function accessRole(env, email) {
  if (email === ownerEmail(env) && email) return "owner";
  return (await read(env, "member:" + email))?.role === "manager"
    ? "manager"
    : null;
}
export async function issueSession(env, identity) {
  const token = random();
  await env.AUREXO_KV.put(
    "session:" + (await hash(token)),
    JSON.stringify({ ...identity, expires: Date.now() + 28800000 }),
    { expirationTtl: 28800 },
  );
  return `__Host-aurexo-google=${token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`;
}
export async function googleSession(env, req) {
  const token = cookie(req, "__Host-aurexo-google");
  if (!token) return null;
  const s = await read(env, "session:" + (await hash(token)));
  if (!s || s.expires <= Date.now()) return null;
  const role = await accessRole(env, s.email);
  return role ? { ...s, role } : null;
}
export async function revokeGoogleSession(env, req) {
  const token = cookie(req, "__Host-aurexo-google");
  if (token) await env.AUREXO_KV.delete("session:" + (await hash(token)));
}
export async function authRoute(env, req, reply) {
  const u = new URL(req.url);
  const ready = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && ownerEmail(env),
  );
  if (u.pathname === "/api/auth/status")
    return reply({
      googleReady: ready,
      ownerPasswordReady:
        typeof env.AUREXO_OWNER_PASSWORD === "string" &&
        env.AUREXO_OWNER_PASSWORD.length >= 16,
      encryptionReady: /^[a-f0-9]{64}$/i.test(env.AUREXO_ENCRYPTION_KEY || ""),
    });
  if (u.pathname === "/api/auth/google/start" && req.method === "POST") {
    if (!ready)
      throw error(
        503,
        "Google sign-in needs the owner to configure the Google OAuth client in Cloudflare.",
      );
    if (env.LIMIT) await env.LIMIT("google-login", 100, 900000);
    const state = random(),
      nonce = random(),
      verifier = random(),
      browser = random();
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...digest))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await env.AUREXO_KV.put(
      "google-state:" + state,
      JSON.stringify({
        nonce,
        verifier,
        browser: await hash(browser),
        expires: Date.now() + 600000,
      }),
      { expirationTtl: 600 },
    );
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: u.origin + "/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return reply({ url: target.href }, 200, {
      "set-cookie": `__Host-aurexo-login=${browser}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    });
  }
  if (u.pathname === "/api/auth/google/callback" && req.method === "GET") {
    const state = u.searchParams.get("state");
    if (!ready || !state || !/^[a-f0-9]{64}$/.test(state))
      throw error(400, "Invalid sign-in state. Start sign-in again.");
    if (!env.AUREXO_KV.take)
      throw error(503, "Atomic sign-in storage unavailable");
    const saved = await env.AUREXO_KV.take("google-state:" + state);
    if (
      !saved ||
      saved.expires < Date.now() ||
      saved.browser !== (await hash(cookie(req, "__Host-aurexo-login") || ""))
    )
      throw error(400, "Sign-in expired or belongs to another browser.");
    if (u.searchParams.has("error"))
      throw error(400, "Google sign-in was canceled.");
    const code = u.searchParams.get("code");
    if (!code || code.length > 4096) throw error(400, "Missing sign-in code");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: saved.verifier,
        redirect_uri: u.origin + "/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });
    const t = await r.json();
    if (!r.ok || !t.id_token)
      throw error(502, "Google could not complete sign-in. Try again.");
    let p;
    try {
      p = (
        await jwtVerify(t.id_token, keys, {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: env.GOOGLE_CLIENT_ID,
          algorithms: ["RS256"],
        })
      ).payload;
    } catch {
      throw error(401, "Google identity could not be verified.");
    }
    if (
      p.nonce !== saved.nonce ||
      p.email_verified !== true ||
      typeof p.email !== "string" ||
      !p.sub ||
      (p.azp && p.azp !== env.GOOGLE_CLIENT_ID)
    )
      throw error(401, "Verified Google email required");
    const email = p.email.toLowerCase();
    // Google must be authoritative for the email to prevent reassignment of third-party addresses.
    if (!email.endsWith("@gmail.com") && !p.hd)
      throw error(403, "Use a Gmail or Google Workspace account.");
    const role = await accessRole(env, email);
    if (!role) {
      if (env.LIMIT) await env.LIMIT("access-requests", 100, 86400000);
      await env.CHANGE("access-requests", (list) =>
        [
          { email, requestedAt: new Date().toISOString() },
          ...(list || []).filter((x) => x.email !== email),
        ].slice(0, 100),
      );
      return reply({}, 303, {
        location: u.origin + "/#access-pending",
        "set-cookie":
          "__Host-aurexo-login=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
    }
    const headers = new Headers({
      location: u.origin + "/#integrations",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    headers.append(
      "set-cookie",
      await issueSession(env, { email, sub: p.sub, role }),
    );
    headers.append(
      "set-cookie",
      "__Host-aurexo-login=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    );
    return new Response(null, { status: 303, headers });
  }
  return null;
}
export async function teamRoute(env, req, reply, identity, body) {
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/team")) return null;
  if (identity.role !== "owner")
    throw error(403, "Only the owner can manage access");
  if (req.method === "GET")
    return reply({
      requests: (await read(env, "access-requests")) || [],
      members: (await read(env, "members")) || [],
    });
  if (req.method === "POST") {
    const b = await body(req, 2000),
      email = String(b.email || "")
        .trim()
        .toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email === ownerEmail(env) ||
      !["approve", "revoke"].includes(b.action)
    )
      throw error(400, "Choose a valid manager account");
    if (
      b.action === "approve" &&
      !((await read(env, "access-requests")) || []).some(
        (x) => x.email === email,
      )
    )
      throw error(409, "This account must first request access with Google");
    await env.AUREXO_KV.put(
      "member:" + email,
      JSON.stringify({ role: b.action === "approve" ? "manager" : null }),
    );
    await env.CHANGE("members", (list) =>
      b.action === "approve"
        ? [
            ...(list || []).filter((x) => x.email !== email),
            { email, role: "manager" },
          ]
        : (list || []).filter((x) => x.email !== email),
    );
    await env.CHANGE("access-requests", (list) =>
      (list || []).filter((x) => x.email !== email),
    );
    return reply({ ok: true });
  }
  throw error(405, "Method not allowed");
}
