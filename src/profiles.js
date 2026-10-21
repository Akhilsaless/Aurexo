export const PROFILES = [
  {
    id: "kids",
    name: "Kids Animation",
    brand: "Nova Little Explorers",
    guidance:
      "Create an original gentle animated adventure with recurring characters, visual humour and a clear learning goal. Require adult review.",
  },
  {
    id: "comedy",
    name: "Comedy",
    brand: "Comedy channel",
    guidance:
      "Create an original comedy sketch with a clear setup, escalation and punchline. Use visual humour and fictional characters. Avoid humiliating real people, dangerous pranks and hateful stereotypes. Do not assume this is children's content.",
  },
  {
    id: "ai",
    name: "AI Playground",
    brand: "AI Playground",
    guidance:
      "Create an original imaginative AI experiment or fictional what-if story with a coherent narrative. Clearly distinguish fiction from verified facts; never impersonate real people or present fabricated events as real.",
  },
];
export const profileName = (id) =>
  PROFILES.find((p) => p.id === id)?.name || "General content (legacy)";
export const channelSlot = (id) =>
  PROFILES.some((p) => p.id === id) ? id : "general";
