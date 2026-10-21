import {
  snapshot,
  mutate,
  editProject,
  project,
  audit,
  problem,
} from "./repository.js";
import {
  reviewChecklist,
  recommendations,
  scoreOpportunity,
} from "../../src/quality.js";
import { seal, unseal, body, credentials } from "./studio.js";
const get = (env, key) => env.AUREXO_KV.get(key, "json");
const put = (env, key, value) => env.AUREXO_KV.put(key, JSON.stringify(value));
async function changeJobs(env, fn) {
  if (env.CHANGE) return env.CHANGE("jobs", (value) => fn(value || []));
  const next = fn((await get(env, "jobs")) || []);
  await put(env, "jobs", next);
  return next;
}
const txt = new TextEncoder();
const hex = (b) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function apiJson(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok)
    throw problem(
      502,
      `External service rejected the request (${r.status}). Check connection permissions and quota.`,
    );
  return b;
}
async function config(env, type) {
  const v = await get(env, "social-config:" + type);
  if (!v)
    throw problem(409, "Configure this social app in Integrations first.");
  return unseal(env, v);
}
async function token(env, type) {
  const record = await get(env, "social-token:" + type);
  if (!record) throw problem(409, "Connect the social account first.");
  let t = await unseal(env, record);
  if (type === "youtube" && t.expiresAt < Date.now() + 60000) {
    if (!t.refresh_token)
      throw problem(409, "Reconnect YouTube to refresh access.");
    const c = await config(env, type);
    const refreshed = await apiJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: t.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    t = {
      ...t,
      ...refreshed,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await put(env, "social-token:" + type, await seal(env, t));
  }
  return t;
}
export async function oauthCallback(env, req, reply) {
  const u = new URL(req.url);
  const type = u.pathname.split("/")[3];
  if (!["youtube", "meta"].includes(type))
    throw problem(404, "Unknown connection");
  const state = u.searchParams.get("state"),
    code = u.searchParams.get("code");
  if (!state || !code)
    throw problem(400, "OAuth was canceled or returned no code");
  const ctx = env.AUREXO_KV.take
    ? await env.AUREXO_KV.take("oauth:" + state)
    : await get(env, "oauth:" + state);
  if (!env.AUREXO_KV.take) await env.AUREXO_KV.delete("oauth:" + state);
  if (!ctx || ctx.type !== type || ctx.expires < Date.now())
    throw problem(
      400,
      "Expired or invalid OAuth state. Start again from Integrations.",
    );
  const c = await config(env, type);
  let t;
  if (type === "youtube") {
    t = await apiJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        code,
        code_verifier: ctx.verifier,
        grant_type: "authorization_code",
        redirect_uri: ctx.redirect,
      }),
    });
    const channels = await apiJson(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { authorization: "Bearer " + t.access_token } },
    );
    if (!channels.items?.length)
      throw problem(409, "No YouTube channel found.");
    t = {
      ...t,
      accountId: channels.items[0].id,
      accountName: channels.items[0].snippet.title,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  } else {
    const q = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: ctx.redirect,
    });
    const short = await apiJson(
      "https://graph.facebook.com/" + c.version + "/oauth/access_token?" + q,
    );
    const long = await apiJson(
      "https://graph.facebook.com/" +
        c.version +
        "/oauth/access_token?" +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: c.clientId,
          client_secret: c.clientSecret,
          fb_exchange_token: short.access_token,
        }),
    );
    const pages = await apiJson(
      "https://graph.facebook.com/" +
        c.version +
        "/me/accounts?fields=id,name,access_token,instagram_business_account",
      { headers: { authorization: "Bearer " + long.access_token } },
    );
    const page = pages.data?.find((p) => p.id === c.pageId);
    if (!page)
      throw problem(
        409,
        "The configured Facebook Page was not authorized. Check its Page ID and permissions.",
      );
    t = {
      access_token: page.access_token,
      accountId: page.id,
      accountName: page.name,
      instagramId: page.instagram_business_account?.id,
      expiresAt: Date.now() + (long.expires_in || 3600) * 1000,
    };
  }
  await put(env, "social-token:" + type, await seal(env, t));
  return Response.redirect(new URL("/#integrations", req.url).toString(), 303);
}
async function sign(env, key, expires) {
  if (!env.AUREXO_ENCRYPTION_KEY) throw problem(503, "Encryption key missing");
  const c = await crypto.subtle.importKey(
    "raw",
    txt.encode(env.AUREXO_ENCRYPTION_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", c, txt.encode(key + "|" + expires)),
  );
}
async function mediaUrl(env, req, key) {
  const expires = Date.now() + 7200000;
  const url = new URL("/api/share/" + encodeURIComponent(key), req.url);
  url.search = new URLSearchParams({
    expires: String(expires),
    sig: await sign(env, key, expires),
  });
  return url.toString();
}
export async function serveMedia(env, req, publicAccess = false) {
  if (!["GET", "HEAD"].includes(req.method))
    throw problem(405, "Method not allowed");
  if (!env.MEDIA) throw problem(503, "Media storage is not configured");
  const url = new URL(req.url);
  const key = decodeURIComponent(url.pathname.split("/").slice(3).join("/"));
  if (publicAccess) {
    const expires = Number(url.searchParams.get("expires"));
    const sig = url.searchParams.get("sig") || "";
    if (
      !Number.isFinite(expires) ||
      expires < Date.now() ||
      expires > Date.now() + 7200000 ||
      sig.length !== 64 ||
      sig !== (await sign(env, key, expires))
    )
      throw problem(403, "Media link expired or invalid");
  }
  const meta = await env.MEDIA.head(key);
  if (!meta) throw problem(404, "Media not found");
  const range = req.headers.get("range");
  let options = {},
    status = 200;
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m) return new Response(null, { status: 416 });
    const offset = Number(m[1]),
      end = m[2] ? Math.min(Number(m[2]), meta.size - 1) : meta.size - 1;
    if (offset > end || offset >= meta.size)
      return new Response(null, { status: 416 });
    options = { range: { offset, length: end - offset + 1 } };
    status = 206;
  }
  const o = req.method === "HEAD" ? meta : await env.MEDIA.get(key, options);
  const headers = {
    "content-type":
      meta.httpMetadata?.contentType || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
  if (status === 206) {
    headers["content-range"] =
      `bytes ${options.range.offset}-${options.range.offset + options.range.length - 1}/${meta.size}`;
    headers["content-length"] = String(options.range.length);
  } else headers["content-length"] = String(meta.size);
  return new Response(req.method === "HEAD" ? null : o.body, {
    status,
    headers,
  });
}
function checkApproved(p) {
  if (
    p.state !== "approved" ||
    !p.media?.key ||
    !p.finalApproval ||
    p.finalApproval.mediaKey !== p.media.key ||
    p.finalApproval.planJSON !== JSON.stringify(p.plan)
  )
    throw problem(
      409,
      "Approve the final video before scheduling or publishing.",
    );
}
export async function productionRoute(env, req, reply) {
  const u = new URL(req.url),
    path = u.pathname,
    method = req.method;
  if (path === "/api/social/status" && method === "GET") {
    const status = {};
    for (const type of ["youtube", "meta"]) {
      const saved = await get(env, "social-token:" + type),
        cfg = await get(env, "social-config:" + type);
      const t = saved ? await unseal(env, saved) : null;
      status[type] = {
        configured: Boolean(cfg),
        connected: Boolean(t),
        account: t?.accountName || "",
        instagram: Boolean(t?.instagramId),
      };
    }
    return reply({
      status,
      mediaStorage: Boolean(env.MEDIA),
      durableScheduling: Boolean(env.SCHEDULE),
    });
  }
  if (path === "/api/social/config" && method === "POST") {
    const b = await body(req, 8000);
    if (
      !["youtube", "meta"].includes(b.type) ||
      typeof b.clientId !== "string" ||
      !b.clientId.trim() ||
      typeof b.clientSecret !== "string" ||
      b.clientSecret.length < 8
    )
      throw problem(400, "Enter social app ID and secret.");
    if (
      b.type === "meta" &&
      (!/^v\d+\.\d+$/.test(b.version || "") || !/^\d+$/.test(b.pageId || ""))
    )
      throw problem(400, "Enter Meta Graph version and numeric Page ID.");
    await put(
      env,
      "social-config:" + b.type,
      await seal(env, {
        clientId: b.clientId.trim(),
        clientSecret: b.clientSecret,
        version: b.version,
        pageId: b.pageId,
      }),
    );
    await env.AUREXO_KV.delete("social-token:" + b.type);
    return reply({ ok: true });
  }
  if (path === "/api/social/connect" && method === "POST") {
    const b = await body(req, 2000);
    if (!["youtube", "meta"].includes(b.type))
      throw problem(400, "Unsupported connection");
    const c = await config(env, b.type),
      state = crypto.randomUUID();
    const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hashed = new Uint8Array(
      await crypto.subtle.digest("SHA-256", txt.encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...hashed))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const redirect = new URL(
      "/api/oauth/" + b.type + "/callback",
      req.url,
    ).toString();
    await env.AUREXO_KV.put(
      "oauth:" + state,
      JSON.stringify({
        type: b.type,
        redirect,
        verifier,
        expires: Date.now() + 600000,
      }),
      { expirationTtl: 600 },
    );
    const target = new URL(
      b.type === "youtube"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://www.facebook.com/" + c.version + "/dialog/oauth",
    );
    target.search = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: redirect,
      response_type: "code",
      state,
      ...(b.type === "youtube"
        ? {
            scope:
              "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
            access_type: "offline",
            prompt: "consent",
            code_challenge: challenge,
            code_challenge_method: "S256",
          }
        : {
            scope:
              "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_insights,read_insights",
          }),
    });
    return reply({ url: target.toString() });
  }
  if (path === "/api/social/disconnect" && method === "POST") {
    const b = await body(req, 2000);
    if (!["youtube", "meta"].includes(b.type))
      throw problem(400, "Unknown connection");
    await env.AUREXO_KV.delete("social-token:" + b.type);
    return reply({ ok: true });
  }
  if (path.startsWith("/api/media/") && ["GET", "HEAD"].includes(method))
    return serveMedia(env, req);
  if (path === "/api/media/upload" && method === "POST") {
    if (!env.MEDIA) throw problem(503, "Media storage is not configured");
    const id = u.searchParams.get("projectId"),
      kind = u.searchParams.get("kind") || "video";
    if (!["video", "audio", "image"].includes(kind))
      throw problem(400, "Invalid media kind");
    await project(env, id);
    const mime = req.headers.get("content-type")?.split(";")[0];
    const accepted = {
      video: ["video/mp4", "video/webm"],
      audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm"],
      image: ["image/png", "image/jpeg", "image/webp"],
    };
    if (!accepted[kind].includes(mime))
      throw problem(400, "Unsupported media format");
    const max = kind === "video" ? 40 * 1024 * 1024 : 20 * 1024 * 1024;
    const length = Number(req.headers.get("content-length"));
    if (!Number.isFinite(length) || length <= 0 || length > max)
      throw problem(413, "File is empty or exceeds the upload size limit");
    const data = await req.arrayBuffer();
    if (data.byteLength > max || data.byteLength !== length)
      throw problem(413, "Upload size mismatch");
    const key = id + "/" + kind + "/" + crypto.randomUUID();
    await env.MEDIA.put(key, data, { httpMetadata: { contentType: mime } });
    const media = {
      key,
      type: mime,
      size: data.byteLength,
      sha256: hex(await crypto.subtle.digest("SHA-256", data)),
      createdAt: new Date().toISOString(),
    };
    const result = await editProject(env, id, (p) => ({
      ...p,
      ...(kind === "video"
        ? { media, finalApproval: null }
        : { [kind]: media }),
      audit: audit(
        p,
        kind + " uploaded; final approval invalidated if video changed",
      ),
    }));
    return reply({ ...result, media });
  }
  if (path === "/api/media/approve" && method === "POST") {
    const b = await body(req, 4000);
    const p = await project(env, b.projectId);
    if (!p.media?.key || p.media.key !== b.mediaKey)
      throw problem(409, "This video changed. Review the current file again.");
    if (!reviewChecklist(p).every(([key]) => b.checks?.[key] === true))
      throw problem(400, "Complete every final-media review check.");
    const reviewedPlan = JSON.stringify(p.plan);
    const result = await editProject(env, p.id, (current) => {
      if (
        current.state !== "approved" ||
        current.media?.key !== b.mediaKey ||
        JSON.stringify(current.plan) !== reviewedPlan
      )
        throw problem(409, "Reviewed content changed. Review it again.");
      return {
        ...current,
        finalApproval: {
          at: new Date().toISOString(),
          mediaKey: current.media.key,
          planJSON: JSON.stringify(current.plan),
          checks: b.checks,
        },
        audit: audit(current, "Owner approved the current final media"),
      };
    });
    return reply(result);
  }
  if (path === "/api/image" && method === "POST") {
    const b = await body(req, 4000);
    if (b.allowUsage !== true)
      throw problem(409, "Confirm image generation usage");
    const p = await project(env, b.projectId);
    const c = await credentials(env, "openai");
    if (!c.active)
      throw problem(
        409,
        "Activate OpenAI for AI illustrations, or upload your own image.",
      );
    if (env.LIMIT) await env.LIMIT("ai-images", 20, 86400000);
    const prompt =
      "Create an original vertical illustration for an educational content video. Do not imitate branded characters or real people. " +
      (p.mode === "kids"
        ? "Gentle, age-appropriate, friendly and clear. "
        : "Clear, visually coherent and editorial. ") +
      String(
        p.plan?.thumbnailPrompt || p.plan?.scenes?.[0]?.visual || p.title,
      ).slice(0, 3000);
    const data = await apiJson("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: "Bearer " + c.key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt,
        size: "1024x1536",
        n: 1,
      }),
    });
    const encoded = data.data?.[0]?.b64_json;
    if (typeof encoded !== "string")
      throw problem(
        502,
        "Image service returned no image. Check image-model access.",
      );
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  }
  if (path === "/api/voice" && method === "POST") {
    const b = await body(req, 12000);
    if (b.allowUsage !== true)
      throw problem(409, "Confirm voice generation usage");
    const p = await project(env, b.projectId);
    if (!p.plan) throw problem(409, "Create a script first");
    const c = await credentials(env, "openai");
    if (!c.active)
      throw problem(
        409,
        "Activate OpenAI to synthesize narration, or upload your own audio.",
      );
    if (env.LIMIT) await env.LIMIT("ai-voice", 30, 86400000);
    const input = p.plan.scenes.map((s) => s.narration).join("\n");
    if (input.length > 4000) throw problem(400, "Narration is too long");
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        authorization: "Bearer " + c.key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: "coral",
        input,
        response_format: "mp3",
        instructions:
          p.mode === "kids"
            ? "Speak gently, slowly and warmly for children."
            : "Speak clearly and naturally.",
      }),
    });
    if (!r.ok)
      throw problem(
        502,
        "Voice service failed. Check OpenAI audio model access and quota.",
      );
    return new Response(r.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  }
  if (path === "/api/publish/jobs" && method === "GET")
    return reply({ jobs: (await get(env, "jobs")) || [] });
  if (path === "/api/publish/jobs" && method === "POST") {
    if (!env.SCHEDULE)
      throw problem(503, "Durable scheduling is not configured");
    const b = await body(req, 4000),
      p = await project(env, b.projectId);
    checkApproved(p);
    if (!["youtube", "instagram", "facebook"].includes(b.platform))
      throw problem(400, "Unsupported platform");
    if (b.platform !== "youtube" && p.media.type !== "video/mp4")
      throw problem(
        400,
        "Instagram/Facebook need an MP4 file. Upload an MP4 export first.",
      );
    const t = await token(env, b.platform === "youtube" ? "youtube" : "meta");
    if (b.platform === "instagram" && !t.instagramId)
      throw problem(
        409,
        "Connect an Instagram professional account linked to the Facebook Page.",
      );
    if (b.confirmPublish !== true)
      throw problem(400, "Explicit publication confirmation is required");
    const runAt = b.runAt ? Date.parse(b.runAt) : Date.now();
    if (
      !Number.isFinite(runAt) ||
      runAt < Date.now() - 60000 ||
      runAt > Date.now() + 90 * 86400000
    )
      throw problem(400, "Choose a time within the next 90 days");
    const jobs = (await get(env, "jobs")) || [];
    const existing = jobs.find(
      (j) =>
        j.projectId === p.id &&
        j.platform === b.platform &&
        j.mediaKey === p.media.key &&
        !["canceled", "failed"].includes(j.state),
    );
    if (existing) return reply({ job: existing, deduplicated: true });
    const job = {
      id: crypto.randomUUID(),
      projectId: p.id,
      platform: b.platform,
      mediaKey: p.media.key,
      mediaHash: p.media.sha256,
      plan: structuredClone(p.plan),
      mode: p.mode,
      runAt,
      state: "queued",
      privacy: b.privacy === "public" ? "public" : "unlisted",
      createdAt: new Date().toISOString(),
      origin: u.origin,
      attempts: 0,
    };
    if (jobs.length >= 500)
      throw problem(
        409,
        "Job history is full. Archive completed jobs before scheduling more.",
      );
    if (env.QUEUE_JOB) return reply(await env.QUEUE_JOB(job), 202);
    await put(env, "jobs", [job, ...jobs]);
    await env.SCHEDULE(runAt);
    return reply({ job }, 202);
  }
  if (path === "/api/publish/resume" && method === "POST") {
    const b = await body(req, 2000);
    let resumed;
    await changeJobs(env, (jobs) => {
      const j = jobs.find((j) => j.id === b.id);
      if (
        !j ||
        j.state !== "needs_attention" ||
        j.platform !== "youtube" ||
        (!j.uploadSession && !j.externalId)
      )
        throw problem(
          409,
          "This job requires manual platform inspection; it cannot be safely resumed automatically.",
        );
      j.state = j.externalId ? "processing" : "uploading";
      j.nextRun = Date.now();
      j.error = null;
      resumed = j;
      return jobs;
    });
    await env.SCHEDULE(Date.now());
    return reply({ job: resumed });
  }
  if (path === "/api/publish/cancel" && method === "POST") {
    const b = await body(req, 2000),
      jobs = (await get(env, "jobs")) || [];
    const j = jobs.find((j) => j.id === b.id);
    if (!j || !["queued", "waiting", "needs_attention"].includes(j.state))
      throw problem(409, "Only queued jobs may be canceled");
    await changeJobs(env, (list) => {
      const current = list.find((v) => v.id === b.id);
      if (
        !current ||
        !["queued", "waiting", "needs_attention"].includes(current.state)
      )
        throw problem(409, "This job has already started");
      current.state = "canceled";
      return list;
    });
    return reply({ ok: true });
  }
  if (path === "/api/analytics/sync" && method === "POST") {
    await body(req, 2000);
    const jobs = ((await get(env, "jobs")) || [])
        .filter((j) => j.state === "published" && j.externalId)
        .slice(0, 30),
      metrics = [],
      errors = [];
    for (const j of jobs) {
      try {
        const syncedAt = new Date().toISOString();
        if (j.platform === "youtube") {
          const t = await token(env, "youtube"),
            end = new Date().toISOString().slice(0, 10),
            start = new Date(Date.now() - 28 * 86400000)
              .toISOString()
              .slice(0, 10);
          const q = new URLSearchParams({
            ids: "channel==MINE",
            startDate: start,
            endDate: end,
            metrics:
              "views,likes,comments,estimatedMinutesWatched,averageViewDuration",
            filters: "video==" + j.externalId,
          });
          const report = await apiJson(
            "https://youtubeanalytics.googleapis.com/v2/reports?" + q,
            { headers: { authorization: "Bearer " + t.access_token } },
          );
          const row = report.rows?.[0];
          metrics.push({
            projectId: j.projectId,
            platform: j.platform,
            title: j.plan.variants.youtube.title,
            videoId: j.externalId,
            views: row?.[0] ?? null,
            likes: row?.[1] ?? null,
            comments: row?.[2] ?? null,
            minutesWatched: row?.[3] ?? null,
            averageViewDuration: row?.[4] ?? null,
            period: "last 28 days",
            syncedAt,
          });
        } else {
          const c = await config(env, "meta"),
            t = await token(env, "meta"),
            headers = { authorization: "Bearer " + t.access_token },
            base = "https://graph.facebook.com/" + c.version;
          const endpoint =
            j.platform === "instagram"
              ? base +
                "/" +
                j.externalId +
                "/insights?metric=views,reach,likes,comments,saved,shares"
              : base +
                "/" +
                j.externalId +
                "/video_insights?metric=total_video_views,total_video_view_total_time";
          const report = await apiJson(endpoint, { headers });
          const values = Object.fromEntries(
            (report.data || []).map((m) => [
              m.name,
              m.values?.at(-1)?.value ?? m.total_value?.value ?? null,
            ]),
          );
          metrics.push({
            projectId: j.projectId,
            platform: j.platform,
            title: j.plan.variants[j.platform].title,
            videoId: j.externalId,
            views: values.views ?? values.total_video_views ?? null,
            likes: values.likes ?? null,
            comments: values.comments ?? null,
            reach: values.reach ?? null,
            saves: values.saved ?? null,
            shares: values.shares ?? null,
            period: "platform lifetime metrics",
            syncedAt,
          });
        }
      } catch (e) {
        errors.push({
          platform: j.platform,
          videoId: j.externalId,
          message: e.status ? e.message : "Metrics unavailable",
        });
      }
    }
    const result = {
      metrics,
      recommendations: recommendations(metrics),
      errors,
      syncedAt: new Date().toISOString(),
    };
    await put(env, "analytics", result);
    return reply(result);
  }
  if (path === "/api/analytics" && method === "GET")
    return reply(
      (await get(env, "analytics")) || {
        metrics: [],
        recommendations: recommendations([]),
      },
    );
  if (path === "/api/discover" && method === "GET") {
    const q = String(u.searchParams.get("q") || "educational science").slice(
      0,
      150,
    );
    const r = await fetch(
      "https://news.google.com/rss/search?" +
        new URLSearchParams({ q, hl: "en", gl: "US", ceid: "US:en" }),
      { signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) throw problem(502, "Discovery feed unavailable");
    const xml = (await r.text()).slice(0, 500000);
    const decode = (s) =>
      s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 12)
      .map(([, s]) => {
        const val = (tag) =>
          decode(
            new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">").exec(
              s,
            )?.[1] || "",
          );
        const date = val("pubDate");
        const ageHours = Math.max(0, (Date.now() - Date.parse(date)) / 3600000);
        return {
          title: val("title"),
          url: val("link"),
          date,
          source: val("source"),
          score: scoreOpportunity({
            ageHours: Number.isFinite(ageHours) ? ageHours : 48,
          }),
          scoreNote:
            "Heuristic based on freshness and neutral fit/effort assumptions, not predicted views.",
        };
      });
    return reply({ items });
  }
  return null;
}
async function updateJob(env, id, change) {
  let result;
  await changeJobs(env, (jobs) => {
    const i = jobs.findIndex((j) => j.id === id);
    if (i < 0) throw problem(404, "Job not found");
    const previous = jobs[i];
    result = {
      ...previous,
      ...change,
      state:
        change.state ||
        (previous.state === "running" ? previous.phase : previous.state),
      leaseUntil: change.state === "publishing" ? Date.now() + 120000 : null,
      updatedAt: new Date().toISOString(),
    };
    jobs[i] = result;
    return jobs;
  });
  return result;
}
export async function runDueJobs(env) {
  const jobs = (await get(env, "jobs")) || [];
  for (const candidate of jobs
    .filter(
      (j) =>
        [
          "queued",
          "waiting",
          "uploading",
          "processing",
          "running",
          "publishing",
        ].includes(j.state) &&
        (["running", "publishing"].includes(j.state)
          ? j.leaseUntil <= Date.now()
          : (j.nextRun || j.runAt) <= Date.now()),
    )
    .slice(0, 3)) {
    if (["running", "publishing"].includes(candidate.state)) {
      if (candidate.leaseUntil && candidate.leaseUntil <= Date.now())
        await updateJob(env, candidate.id, {
          state: "needs_attention",
          error:
            "A job was interrupted. Inspect the existing upload before safely resuming.",
        });
      continue;
    }
    if ((candidate.nextRun || candidate.runAt) > Date.now()) continue;
    let job;
    await changeJobs(env, (list) => {
      const j = list.find((j) => j.id === candidate.id);
      if (
        !j ||
        !["queued", "waiting", "uploading", "processing"].includes(j.state) ||
        (j.nextRun || j.runAt) > Date.now()
      )
        return list;
      job = structuredClone(j);
      j.phase = j.state;
      j.state = "running";
      j.leaseUntil = Date.now() + 120000;
      return list;
    });
    if (!job) continue;
    await env.SCHEDULE?.(Date.now() + 120000);
    try {
      const p = await project(env, job.projectId);
      checkApproved(p);
      if (
        p.media.key !== job.mediaKey ||
        p.media.sha256 !== job.mediaHash ||
        JSON.stringify(p.plan) !== JSON.stringify(job.plan)
      )
        throw problem(
          409,
          "Reviewed content changed. Cancel this job and review the current content.",
        );
      if (job.platform === "youtube") await youtubeStep(env, job, p);
      else await metaStep(env, job, p);
    } catch (e) {
      await updateJob(env, job.id, {
        state: "needs_attention",
        error: e.status
          ? e.message
          : "Upload interrupted. Inspect platform state before retrying.",
      });
    }
  }
}
async function confirmed(env, job, id, url) {
  await updateJob(env, job.id, {
    state: "published",
    externalId: id,
    url,
    publishedAt: new Date().toISOString(),
    error: null,
  });
  await editProject(env, job.projectId, (p) => ({
    ...p,
    publications: {
      ...p.publications,
      [job.platform]: { id, url, at: new Date().toISOString() },
    },
    audit: audit(
      p,
      "Platform confirmed " + job.platform + " publication: " + id,
    ),
  }));
}
async function youtubeStep(env, job, p) {
  const t = await token(env, "youtube");
  if (job.externalId) {
    const status = await apiJson(
      "https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=" +
        encodeURIComponent(job.externalId),
      { headers: { authorization: "Bearer " + t.access_token } },
    );
    const video = status.items?.[0];
    if (!video)
      throw problem(502, "Uploaded video was not found in this account");
    if (["rejected", "failed", "deleted"].includes(video.status?.uploadStatus))
      throw problem(502, "YouTube rejected or removed the uploaded video");
    if (
      video.status?.uploadStatus === "processed" &&
      video.status?.privacyStatus === job.privacy
    ) {
      await confirmed(
        env,
        job,
        job.externalId,
        "https://www.youtube.com/watch?v=" + job.externalId,
      );
      return;
    }
    if ((job.polls || 0) > 120)
      throw problem(
        502,
        "YouTube processing or visibility needs review in Studio.",
      );
    await updateJob(env, job.id, {
      state: "processing",
      polls: (job.polls || 0) + 1,
      nextRun: Date.now() + 30000,
    });
    return;
  }
  let session = job.uploadSession;
  if (!session) {
    const r = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: {
          authorization: "Bearer " + t.access_token,
          "content-type": "application/json",
          "x-upload-content-type": p.media.type,
          "x-upload-content-length": String(p.media.size),
        },
        body: JSON.stringify({
          snippet: {
            title: job.plan.variants.youtube.title.slice(0, 100),
            description: job.plan.variants.youtube.caption.slice(0, 5000),
          },
          status: {
            privacyStatus: job.privacy,
            selfDeclaredMadeForKids: job.mode === "kids",
            containsSyntheticMedia: true,
          },
        }),
      },
    );
    if (!r.ok) throw problem(502, "YouTube rejected upload initialization");
    session = r.headers.get("location");
    if (!session || new URL(session).origin !== "https://www.googleapis.com")
      throw problem(502, "Unexpected YouTube upload location");
    await updateJob(env, job.id, {
      state: "uploading",
      uploadSession: session,
      offset: 0,
      nextRun: Date.now() + 1000,
    });
    return;
  }
  // Probe server offset before sending: resumes after crashes without starting another video.
  const probe = await fetch(session, {
    method: "PUT",
    signal: AbortSignal.timeout(30000),
    headers: {
      authorization: "Bearer " + t.access_token,
      "content-range": "bytes */" + p.media.size,
      "content-length": "0",
    },
  });
  if (probe.ok) {
    const done = await probe.json();
    if (!done.id) throw problem(502, "YouTube returned no video ID");
    await updateJob(env, job.id, {
      state: "processing",
      externalId: done.id,
      nextRun: Date.now() + 15000,
    });
    return;
  }
  if (probe.status !== 308)
    throw problem(
      502,
      "YouTube upload session expired or requires attention; do not start a duplicate upload blindly.",
    );
  const range = probe.headers.get("range"),
    offset = range ? Number(/(\d+)$/.exec(range)?.[1]) + 1 : 0;
  if (!Number.isFinite(offset) || offset >= p.media.size)
    throw problem(502, "Invalid upload offset");
  const length = Math.min(4 * 1024 * 1024, p.media.size - offset);
  const object = await env.MEDIA.get(p.media.key, {
    range: { offset, length },
  });
  if (!object) throw problem(404, "Stored video missing");
  const r = await fetch(session, {
    method: "PUT",
    signal: AbortSignal.timeout(60000),
    headers: {
      authorization: "Bearer " + t.access_token,
      "content-type": p.media.type,
      "content-length": String(length),
      "content-range": `bytes ${offset}-${offset + length - 1}/${p.media.size}`,
    },
    body: object.body,
    duplex: "half",
  });
  if (r.ok) {
    const data = await r.json();
    if (!data.id) throw problem(502, "YouTube returned no video ID");
    await updateJob(env, job.id, {
      state: "processing",
      externalId: data.id,
      nextRun: Date.now() + 15000,
    });
  } else if (r.status === 308)
    await updateJob(env, job.id, {
      offset: offset + length,
      nextRun: Date.now() + 1000,
    });
  else
    throw problem(
      502,
      "YouTube upload interrupted. The saved session can be inspected without creating another upload.",
    );
}
async function metaStep(env, job, p) {
  const c = await config(env, "meta"),
    t = await token(env, "meta");
  const base = "https://graph.facebook.com/" + c.version;
  const headers = { authorization: "Bearer " + t.access_token };
  if (job.platform === "instagram") {
    if (!t.instagramId)
      throw problem(409, "No linked Instagram professional account");
    if (!job.containerId) {
      const url = await mediaUrl(env, new Request(job.origin), p.media.key);
      const data = await apiJson(base + "/" + t.instagramId + "/media", {
        method: "POST",
        headers,
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: url,
          caption: job.plan.variants.instagram.caption,
        }),
      });
      if (!data.id) throw problem(502, "Instagram returned no media container");
      await updateJob(env, job.id, {
        containerId: data.id,
        state: "waiting",
        nextRun: Date.now() + 15000,
        attempts: job.attempts + 1,
      });
      return;
    }
    const check = await apiJson(
      base + "/" + job.containerId + "?fields=status_code",
      { headers },
    );
    if (check.status_code === "IN_PROGRESS") {
      if (job.attempts > 40)
        throw problem(502, "Instagram processing exceeded ten minutes");
      await updateJob(env, job.id, {
        nextRun: Date.now() + 15000,
        attempts: job.attempts + 1,
      });
      return;
    }
    if (check.status_code !== "FINISHED")
      throw problem(502, "Instagram media processing failed or expired");
    await updateJob(env, job.id, { state: "publishing" });
    const data = await apiJson(base + "/" + t.instagramId + "/media_publish", {
      method: "POST",
      headers,
      body: new URLSearchParams({ creation_id: job.containerId }),
    });
    if (!data.id) throw problem(502, "Instagram returned no publication ID");
    const info = await apiJson(base + "/" + data.id + "?fields=permalink", {
      headers,
    });
    await confirmed(
      env,
      job,
      data.id,
      info.permalink || "https://www.instagram.com/",
    );
    return;
  }
  if (job.externalId) {
    const info = await apiJson(
      base + "/" + job.externalId + "?fields=status,published",
      { headers },
    );
    if (info.published === true && info.status?.video_status === "ready") {
      await confirmed(
        env,
        job,
        job.externalId,
        "https://www.facebook.com/" + job.externalId,
      );
      return;
    }
    if ((job.polls || 0) > 120)
      throw problem(502, "Facebook processing needs attention.");
    await updateJob(env, job.id, {
      state: "processing",
      polls: (job.polls || 0) + 1,
      nextRun: Date.now() + 30000,
    });
    return;
  }
  // Mark side-effect boundary before upload. Ambiguous failures require inspection, never blind retry.
  await updateJob(env, job.id, { state: "publishing" });
  const url = await mediaUrl(env, new Request(job.origin), p.media.key);
  const data = await apiJson(base + "/" + t.accountId + "/videos", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      file_url: url,
      title: job.plan.variants.facebook.title,
      description: job.plan.variants.facebook.caption,
      published: "true",
    }),
  });
  if (!data.id) throw problem(502, "Facebook returned no video ID");
  await updateJob(env, job.id, {
    state: "processing",
    externalId: data.id,
    nextRun: Date.now() + 15000,
  });
}
