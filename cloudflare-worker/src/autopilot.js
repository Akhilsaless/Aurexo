import { PROFILES, channelSlot } from "../../src/profiles.js";
import {
  credentials,
  completion,
  validatePlan,
  body,
  unseal,
} from "./studio.js";
import { animationRoute } from "./animation.js";
import { productionRoute } from "./production.js";
import {
  snapshot,
  mutate,
  project,
  editProject,
  audit,
  problem,
} from "./repository.js";
import { hash } from "./access.js";
const read = (env, key) => env.AUREXO_KV.get(key, "json");
const patch = (env, id, changes) =>
  env.CHANGE("autopilot", (rows) =>
    (rows || []).map((r) => (r.id === id ? { ...r, ...changes } : r)),
  );
async function destination(env, slot) {
  const saved = await read(
    env,
    "social-token:youtube" + (slot === "general" ? "" : ":" + slot),
  );
  if (!saved)
    throw problem(
      409,
      "Connect or select a YouTube channel in Integrations first.",
    );
  const t = await unseal(env, saved);
  return { slot, accountId: t.accountId, accountName: t.accountName };
}
export async function autopilotRoute(env, req, reply) {
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/autopilot")) return null;
  if (!env.CHANGE || !env.SCHEDULE || !env.MEDIA)
    throw problem(503, "Automatic production runtime unavailable");
  if (path === "/api/autopilot" && req.method === "GET") {
    const channels = [];
    for (const slot of ["general", ...PROFILES.map((p) => p.id)]) {
      try {
        channels.push(await destination(env, slot));
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
    const projects = (await snapshot(env)).projects;
    const runs = ((await read(env, "autopilot")) || []).map(
      ({ assemblyLease, ...r }) => ({
        ...r,
        review: ["review", "needs_attention", "generating"].includes(r.state)
          ? projects.find((p) => p.id === r.projectId)?.plan
          : undefined,
      }),
    );
    return reply({ runs, channels });
  }
  if (req.method !== "POST") throw problem(405, "Method not allowed");
  const b = await body(req, 6000);
  if (path === "/api/autopilot/start" && req.method === "POST") {
    if (!PROFILES.some((p) => p.id === b.mode))
      throw problem(400, "Choose a content studio");
    if (b.allowUsage !== true)
      throw problem(
        409,
        "Authorize Gemini text and up to three paid video requests first",
      );
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(b.requestId || ""))
      throw problem(400, "Request ID required");
    const existing = ((await read(env, "autopilot")) || []).find(
      (r) => r.id === b.requestId,
    );
    if (existing) return reply({ run: existing }, 202);
    const c = await credentials(env, "gemini");
    if (!c.active) throw problem(409, "Activate Gemini in Integrations first");
    const today = new Date().toISOString().slice(0, 10);
    const used = ((await read(env, "animations")) || []).filter(
      (j) =>
        j.createdAt.startsWith(today) &&
        !(
          j.providerRejected ||
          /^Google video request failed \(429\)/.test(j.message || "")
        ),
    ).length;
    if (used + 3 > Number(env.AUREXO_DAILY_VIDEO_LIMIT ?? 3))
      throw problem(
        429,
        "Automatic production needs three available video requests. Daily video allowance is exhausted.",
      );
    const target = await destination(env, channelSlot(b.channelSlot));
    if (b.accountId !== target.accountId)
      throw problem(409, "The selected channel changed. Refresh channels.");
    const run = {
      id: b.requestId,
      projectId: crypto.randomUUID(),
      mode: b.mode,
      ...target,
      privacy: b.privacy === "public" ? "public" : "unlisted",
      state: "queued",
      createdAt: new Date().toISOString(),
      actor: env.ACTOR || { role: "owner" },
      origin: new URL(req.url).origin,
    };
    let result = run;
    await env.CHANGE("autopilot", (rows) => {
      const list = rows || [],
        duplicate = list.find((r) => r.id === run.id);
      if (duplicate) {
        result = duplicate;
        return list;
      }
      if (
        list.some(
          (r) =>
            !["published", "rejected", "needs_attention"].includes(r.state),
        )
      )
        throw problem(
          409,
          "Finish or reject the current automatic video first",
        );
      if (list.length >= 100)
        throw problem(409, "Automatic production history is full");
      return [run, ...list];
    });
    await env.SCHEDULE(Date.now() + 1000);
    return reply({ run: result }, 202);
  }
  const run = ((await read(env, "autopilot")) || []).find((r) => r.id === b.id);
  if (!run) throw problem(404, "Automatic video not found");
  if (path === "/api/autopilot/reject") {
    if (["planning", "generating", "queued"].includes(run.state))
      throw problem(
        409,
        "Wait for generation to finish before rejecting; paid calls cannot be canceled safely",
      );
    if (["publishing", "published"].includes(run.state))
      throw problem(
        409,
        "Inspect the publishing job before changing this video",
      );
    await patch(env, run.id, { state: "rejected" });
    return reply({ ok: true });
  }
  const p = await project(env, run.projectId);
  if ((await hash(JSON.stringify(p.plan))) !== run.fingerprint)
    throw problem(
      409,
      "The generated script changed. Start a new automatic video.",
    );
  if (path === "/api/autopilot/assembly") {
    let lease;
    await env.CHANGE("autopilot", (rows) =>
      rows.map((r) => {
        if (r.id !== run.id) return r;
        if (r.state !== "assembling" && r.state !== "clips_ready")
          throw problem(409, "Clips are not ready");
        if (r.leaseUntil > Date.now())
          throw problem(409, "Another tab is assembling this video");
        lease = crypto.randomUUID();
        return {
          ...r,
          state: "assembling",
          assemblyLease: lease,
          leaseUntil: Date.now() + 300000,
        };
      }),
    );
    return reply({ lease, projectId: p.id, clips: run.clips });
  }
  if (path === "/api/autopilot/assembled") {
    if (
      run.state !== "assembling" ||
      b.lease !== run.assemblyLease ||
      !p.media?.key ||
      b.mediaKey !== p.media.key
    )
      throw problem(409, "Assembly changed; reload the automatic video");
    await patch(env, run.id, {
      state: "review",
      mediaKey: p.media.key,
      leaseUntil: 0,
    });
    return reply(await snapshot(env));
  }
  if (path === "/api/autopilot/approve") {
    if (!["review", "publishing", "published"].includes(run.state))
      throw problem(409, "Wait for the finished video");
    const target = await destination(env, run.slot);
    if (target.accountId !== run.accountId)
      throw problem(
        409,
        "The selected channel changed. Connect the original channel before approving.",
      );
    if (run.mediaKey !== p.media?.key || b.mediaKey !== run.mediaKey)
      throw problem(409, "Video changed. Review the current video again");
    const checks = ["facts", "rights", "media", "audience", "disclosure"];
    if (!checks.every((k) => b.checks?.[k] === true))
      throw problem(400, "Confirm the final review before uploading");
    await editProject(env, p.id, (current) => {
      if (
        JSON.stringify(current.plan) !== JSON.stringify(p.plan) ||
        current.media?.key !== run.mediaKey
      )
        throw problem(409, "Content changed during approval");
      return {
        ...current,
        state: "approved",
        finalApproval: {
          at: new Date().toISOString(),
          actor: env.ACTOR,
          mediaKey: run.mediaKey,
          planJSON: JSON.stringify(current.plan),
          checks: b.checks,
        },
        audit: audit(
          current,
          "Human approved automatic video and authorized YouTube upload",
        ),
      };
    });
    const response = await productionRoute(
      env,
      new Request(run.origin + "/api/publish/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: p.id,
          platform: "youtube",
          channelSlot: run.slot,
          accountId: run.accountId,
          privacy: run.privacy,
          confirmPublish: true,
        }),
      }),
      (data, status = 200) => Response.json(data, { status }),
    );
    const result = await response.json();
    await patch(env, run.id, {
      state: "publishing",
      publishJobId: result.job.id,
    });
    return reply({ ...(await snapshot(env)), job: result.job });
  }
  throw problem(404, "Unknown automatic production action");
}
export async function runAutopilot(env) {
  const runs = (await read(env, "autopilot")) || [];
  for (const run of runs) {
    if (run.state === "planning") {
      await patch(env, run.id, {
        state: "needs_attention",
        message: "Planning was interrupted. No automatic paid retry.",
      });
      continue;
    }
    if (run.state === "queued") {
      let claimed = false;
      await env.CHANGE("autopilot", (rows) =>
        rows.map((r) => {
          if (r.id !== run.id || r.state !== "queued") return r;
          claimed = true;
          return { ...r, state: "planning" };
        }),
      );
      if (!claimed) continue;
      try {
        const c = await credentials(env, "gemini");
        if (!c.active) throw problem(409, "Gemini is not active");
        await env.LIMIT?.("ai-autopilot", 10, 86400000);
        const profile = PROFILES.find((p) => p.id === run.mode);
        const result = await completion(
          "gemini",
          c,
          [
            {
              role: "system",
              content:
                "Choose an original fictional story idea and produce a complete 24-30 second vertical animated short. Return JSON only: title:string, script:{hook,body,cta}, scenes:[{visual,narration}], variants:{youtube:{title,caption},instagram:{title,caption},facebook:{title,caption}}, thumbnailPrompt:string, reviewFlags:string[]. Exactly three scenes, each <=10 seconds; narration <=18 words per scene. A single consistent original teal round robot Nova, gold star badge. Beginning, development and satisfying ending. No external facts, real people, existing franchises, licensed music or claims of research. No engagement pressure for children. No unsafe acts or instructions. Include review flags for human review and AI disclosures. " +
                profile.guidance +
                (run.mode === "kids"
                  ? " Ages 6-8; gentle humour and one clear learning goal."
                  : ""),
            },
            {
              role: "user",
              content: JSON.stringify({
                studio: profile.name,
                novelSeed: run.id,
              }),
            },
          ],
          true,
        );
        const data = JSON.parse(result.text),
          plan = validatePlan(data);
        if (
          plan.scenes.length !== 3 ||
          plan.scenes.some((s) => s.narration.split(/\s+/).length > 22)
        )
          throw problem(
            502,
            "AI returned an overlong scene plan. No video requests were made.",
          );
        const p = {
          id: run.projectId,
          title: String(data.title || plan.variants.youtube.title).slice(
            0,
            300,
          ),
          mode: run.mode,
          age: run.mode === "kids" ? "6–8" : "",
          state: "review",
          createdAt: new Date().toISOString(),
          plan,
          notes: "AI-created original fictional short. Human review required.",
          provider: "gemini",
          model: c.model,
          audit: [
            {
              at: new Date().toISOString(),
              action:
                "AI automatically selected the story idea and wrote the production plan",
            },
          ],
        };
        await mutate(env, (projects) =>
          projects.some((p) => p.id === run.projectId)
            ? projects
            : [p, ...projects],
        );
        await patch(env, run.id, {
          state: "generating",
          fingerprint: await hash(JSON.stringify(plan)),
          title: p.title,
        });
      } catch (e) {
        await patch(env, run.id, {
          state: "needs_attention",
          message: e.status
            ? e.message
            : "Planning failed. No automatic retry; inspect provider usage.",
        });
      }
      continue;
    }
    if (run.state === "generating") {
      try {
        const p = await project(env, run.projectId);
        if ((await hash(JSON.stringify(p.plan))) !== run.fingerprint)
          throw problem(409, "Script changed. Automatic production stopped.");
        const all = ((await read(env, "animations")) || []).filter(
          (j) => j.projectId === p.id && j.fingerprint === run.fingerprint,
        );
        if (all.some((j) => j.state === "needs_attention"))
          throw problem(
            409,
            all.find((j) => j.state === "needs_attention").message,
          );
        if (all.some((j) => ["running", "queued"].includes(j.state))) continue;
        const scene = p.plan.scenes.findIndex(
          (_, i) => !all.some((j) => j.scene === i && j.state === "completed"),
        );
        if (scene < 0) {
          await patch(env, run.id, {
            state: "clips_ready",
            clips: p.plan.scenes.map(
              (_, i) => all.find((j) => j.scene === i).media,
            ),
          });
          continue;
        }
        await animationRoute(
          env,
          new Request(run.origin + "/api/animation", {
            method: "POST",
            body: JSON.stringify({ projectId: p.id, scene, allowUsage: true }),
          }),
          (v) => v,
        );
      } catch (e) {
        await patch(env, run.id, {
          state: "needs_attention",
          message: e.status
            ? e.message
            : "Automatic production stopped. Inspect provider usage.",
        });
      }
    }
    if (run.state === "publishing") {
      const job = ((await read(env, "jobs")) || []).find(
        (j) => j.id === run.publishJobId,
      );
      if (job?.state === "published")
        await patch(env, run.id, { state: "published", url: job.url });
      if (["needs_attention", "failed", "canceled"].includes(job?.state))
        await patch(env, run.id, {
          state: "needs_attention",
          message: job.error || "Inspect the upload job before retrying",
        });
    }
  }
}
