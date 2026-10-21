import studio from "./studio.js";
import { runAnimations } from "./animation.js";
import { runDueJobs } from "./production.js";
import { problem } from "./repository.js";
export class StudioRuntime {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    const storage = ctx.storage;
    this.store = {
      get: async (key, type) => {
        const item = await storage.get(key);
        if (!item || (item.expires && item.expires < Date.now())) return null;
        return type === "json" ? JSON.parse(item.value) : item.value;
      },
      put: (key, value, options = {}) =>
        storage.put(key, {
          value,
          expires: options.expirationTtl
            ? Date.now() + options.expirationTtl * 1000
            : null,
        }),
      delete: (key) => storage.delete(key),
      take: (key) =>
        storage.transaction(async (tx) => {
          const item = await tx.get(key);
          await tx.delete(key);
          return item && (!item.expires || item.expires > Date.now())
            ? JSON.parse(item.value)
            : null;
        }),
    };
    this.change = (key, fn) =>
      storage.transaction(async (tx) => {
        const saved = await tx.get(key),
          next = fn(saved ? JSON.parse(saved.value) : null);
        await tx.put(key, { value: JSON.stringify(next) });
        return next;
      });
    this.repository = {
      read: () =>
        storage.transaction(async (tx) => {
          const p = await tx.get("projects"),
            r = await tx.get("revision");
          return {
            projects: p ? JSON.parse(p.value) : [],
            revision: r ? JSON.parse(r.value) : 0,
          };
        }),
      update: (fn, expected) =>
        storage.transaction(async (tx) => {
          const p = await tx.get("projects"),
            r = await tx.get("revision");
          const revision = r ? JSON.parse(r.value) : 0;
          if (expected !== undefined && revision !== expected)
            throw problem(
              409,
              "Projects changed elsewhere. Load server projects before saving.",
            );
          const projects = fn(p ? JSON.parse(p.value) : []);
          await tx.put("projects", { value: JSON.stringify(projects) });
          await tx.put("revision", { value: JSON.stringify(revision + 1) });
          return { projects, revision: revision + 1 };
        }),
    };
  }
  bindings() {
    return {
      ...this.env,
      AUREXO_KV: this.store,
      REPOSITORY: this.repository,
      CHANGE: this.change,
      LIMIT: async (key, max, windowMs) =>
        this.change("limit:" + key, (current) => {
          const value =
            current?.until > Date.now()
              ? current
              : { count: 0, until: Date.now() + windowMs };
          if (value.count >= max)
            throw problem(
              429,
              "Request limit reached. Try again after the current window.",
            );
          return { ...value, count: value.count + 1 };
        }),
      QUEUE_JOB: (job) =>
        this.ctx.storage.transaction(async (tx) => {
          const saved = await tx.get("jobs"),
            jobs = saved ? JSON.parse(saved.value) : [];
          const existing = jobs.find(
            (j) =>
              j.projectId === job.projectId &&
              j.platform === job.platform &&
              j.mediaKey === job.mediaKey &&
              !["canceled", "failed"].includes(j.state),
          );
          if (existing) return { job: existing, deduplicated: true };
          if (jobs.length >= 500)
            throw problem(409, "Archive completed jobs before adding more.");
          await tx.put("jobs", { value: JSON.stringify([job, ...jobs]) });
          const alarm = await tx.getAlarm();
          if (!alarm || job.runAt < alarm) await tx.setAlarm(job.runAt);
          return { job };
        }),
      SCHEDULE: async (time) => {
        const current = await this.ctx.storage.getAlarm();
        if (!current || current <= Date.now() || time < current)
          await this.ctx.storage.setAlarm(time);
      },
    };
  }
  fetch(req) {
    return studio.fetch(req, this.bindings());
  }
  async alarm() {
    const env = this.bindings();
    try {
      await runDueJobs(env);
      await runAnimations(env);
    } finally {
      const jobs = (await this.store.get("jobs", "json")) || [];
      const times = jobs
        .filter((j) =>
          [
            "queued",
            "waiting",
            "uploading",
            "processing",
            "running",
            "publishing",
          ].includes(j.state),
        )
        .map((j) =>
          j.state === "running" || j.state === "publishing"
            ? j.leaseUntil || Date.now() + 120000
            : j.nextRun || j.runAt,
        );
      const animations = (await this.store.get("animations", "json")) || [];
      if (animations.some((j) => j.state === "queued"))
        times.push(Date.now() + 1000);
      if (times.length)
        await this.ctx.storage.setAlarm(
          Math.max(Date.now() + 1000, Math.min(...times)),
        );
      else await this.ctx.storage.deleteAlarm();
    }
  }
}
export default {
  fetch(req, env) {
    if (new URL(req.url).pathname.startsWith("/api/")) {
      if (!env.STUDIO)
        return Response.json(
          { error: { message: "Studio runtime binding missing" } },
          { status: 503 },
        );
      return env.STUDIO.get(env.STUDIO.idFromName("owner")).fetch(req);
    }
    return studio.fetch(req, env);
  },
};
