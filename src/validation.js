export function validProject(p) {
  if (
    !p ||
    typeof p !== "object" ||
    typeof p.id !== "string" ||
    p.id.length > 100 ||
    !/^[a-zA-Z0-9_-]+$/.test(p.id) ||
    typeof p.title !== "string" ||
    p.title.length > 300 ||
    !["draft", "review", "approved"].includes(p.state) ||
    !["general", "kids", "comedy", "ai"].includes(p.mode) ||
    !Number.isFinite(Date.parse(p.createdAt))
  )
    return false;
  if (p.notes !== undefined && typeof p.notes !== "string") return false;
  if (
    p.audit !== undefined &&
    (!Array.isArray(p.audit) ||
      p.audit.some(
        (a) => !a || typeof a.at !== "string" || typeof a.action !== "string",
      ))
  )
    return false;
  if (p.state !== "draft" && !p.plan) return false;
  if (!p.plan) return true;
  const q = p.plan;
  return (
    ["hook", "body", "cta"].every((k) => typeof q.script?.[k] === "string") &&
    Array.isArray(q.scenes) &&
    q.scenes.length > 0 &&
    q.scenes.length <= 20 &&
    q.scenes.every(
      (s) =>
        s && typeof s.visual === "string" && typeof s.narration === "string",
    ) &&
    Array.isArray(q.reviewFlags) &&
    q.reviewFlags.every((s) => typeof s === "string") &&
    q.variants &&
    ["youtube", "instagram", "facebook"].every(
      (k) =>
        typeof q.variants[k]?.title === "string" &&
        typeof q.variants[k]?.caption === "string",
    )
  );
}
