import type { EntityType } from "@jarvis/types";

/** Node colors by type. Cobalt family for markets, ink for knowledge, gray for context. */
export const TYPE_COLOR: Record<EntityType, string> = {
  theme: "#3046F5",
  asset: "#0A0A0A",
  company: "#1F33D6",
  person: "#737373",
  protocol: "#5A6CF8",
  trade: "#0A0A0A",
  idea: "#8C99FA",
  thesis: "#3046F5",
  document: "#A3A3A3",
  event: "#D92D20",
  research: "#737373",
  portfolio: "#0A0A0A",
  wallet: "#0A0A0A",
};

/** Stable muted tones for cluster hulls/backgrounds. */
export const CLUSTER_TINTS = ["#EEF0FE", "#F1F2F4", "#E6FDFF", "#FDF0EF", "#F3F4FF", "#EFF7F2"];
