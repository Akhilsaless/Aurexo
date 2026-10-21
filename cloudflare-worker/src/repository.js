// Shared transactional repository. The runtime supplies a Durable Object transaction.
export const problem = (status, message) =>
  Object.assign(new Error(message), { status });
export async function snapshot(env) {
  if (env.REPOSITORY) return env.REPOSITORY.read();
  return {
    projects: (await env.AUREXO_KV.get("projects", "json")) || [],
    revision: (await env.AUREXO_KV.get("revision", "json")) || 0,
  };
}
export async function mutate(env, change, revision) {
  if (env.REPOSITORY) return env.REPOSITORY.update(change, revision);
  // Test/legacy adapter; production always uses the transactional runtime.
  const current = await snapshot(env);
  if (revision !== undefined && revision !== current.revision)
    throw problem(
      409,
      "Projects changed elsewhere. Load server projects before saving.",
    );
  const projects = change(structuredClone(current.projects));
  const next = { projects, revision: current.revision + 1 };
  await env.AUREXO_KV.put("projects", JSON.stringify(projects));
  await env.AUREXO_KV.put("revision", JSON.stringify(next.revision));
  return next;
}
export const editProject = (env, id, change) =>
  mutate(env, (projects) => {
    const i = projects.findIndex((p) => p.id === id);
    if (i < 0) throw problem(404, "Project not found");
    projects[i] = change(projects[i]);
    return projects;
  });
export const audit = (p, action) => [
  ...(p.audit || []).slice(-199),
  { at: new Date().toISOString(), action },
];
export async function project(env, id) {
  const p = (await snapshot(env)).projects.find((p) => p.id === id);
  if (!p) throw problem(404, "Project not found");
  return p;
}
