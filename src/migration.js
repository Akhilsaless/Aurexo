export function migrateLegacy(campaigns, existing = []) {
  const ids = new Set(existing.map((p) => p.id));
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter((c) => c && typeof c.title === "string")
    .map((c, i) => {
      const id = "legacy_" + String(c.id || i).replace(/[^a-zA-Z0-9_-]/g, "_");
      if (ids.has(id)) return null;
      const script = c.script
        ? {
            hook: String(c.script.hook || ""),
            body: String(c.script.body || ""),
            cta: String(c.script.cta || ""),
          }
        : null;
      const plan = script
        ? {
            script,
            scenes: (c.scenePlan?.length
              ? c.scenePlan
              : [{ visual: "Review and recreate original visuals" }]
            ).map((s) => ({
              visual: String(s.visual || s.visualPrompt || ""),
              narration: String(s.narration || script.body),
            })),
            variants: Object.fromEntries(
              ["youtube", "instagram", "facebook"].map((k) => [
                k,
                {
                  title: String(c.variants?.[k]?.title || c.title),
                  caption: String(c.variants?.[k]?.caption || ""),
                },
              ]),
            ),
            reviewFlags: [
              "Imported from an earlier build. Verify all claims and create real media.",
            ],
            thumbnailPrompt: "",
          }
        : null;
      return {
        id,
        title: c.title.slice(0, 300),
        mode: "general",
        age: "",
        notes:
          "Imported content; no previous factual, media or publication status is trusted.",
        state: plan ? "review" : "draft",
        createdAt: Number.isFinite(Date.parse(c.createdAt))
          ? c.createdAt
          : new Date().toISOString(),
        plan,
        audit: [
          {
            at: new Date().toISOString(),
            action: "Imported earlier AUREXO draft; approval required",
          },
        ],
      };
    })
    .filter(Boolean);
}
