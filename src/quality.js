// Explicit checks, not a claim of automated legal or factual certification.
export function reviewChecklist(p) {
  return [
    ["facts", "I checked every factual claim against the linked sources."],
    [
      "rights",
      "I own or have permission to use every visual, voice and music asset.",
    ],
    [
      "media",
      "I watched the entire final video and checked sound, captions and pacing.",
    ],
    [
      "audience",
      p.mode === "kids"
        ? "I checked the age group, learning goal, safety and made-for-kids designation."
        : "I checked audience suitability and platform metadata.",
    ],
    [
      "disclosure",
      "I checked required synthetic-media and sponsorship disclosures.",
    ],
  ];
}
export function recommendations(metrics = []) {
  const rows = metrics.filter(
    (m) =>
      Number.isFinite(m.views) &&
      m.views > 0 &&
      Number.isFinite(m.averageViewDuration),
  );
  if (!rows.length)
    return ["Publish content and sync performance before drawing conclusions."];
  const best = [...rows].sort(
    (a, b) => (b.averageViewDuration || 0) - (a.averageViewDuration || 0),
  )[0];
  return [
    `${best.title || "The leading video"} has the highest observed average viewing duration (${Math.round(best.averageViewDuration || 0)} seconds). Test its opening structure in a future video.`,
    "Compare several similar videos before treating a pattern as reliable; these are observations, not causal conclusions.",
  ];
}
export function scoreOpportunity({
  ageHours = 24,
  audienceFit = 50,
  competition = 50,
  effort = 50,
}) {
  const score = Math.round(
    0.3 * Math.max(0, 100 - ageHours * 2) +
      0.35 * audienceFit +
      0.2 * (100 - competition) +
      0.15 * (100 - effort),
  );
  return Math.max(0, Math.min(100, score));
}
