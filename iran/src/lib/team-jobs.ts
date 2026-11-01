/** The 16 icons a restaurant can give its own jobs (shared by the server and the pickers). */
export const TEAM_JOB_ICONS = [
  "crown",
  "calculator",
  "hand-platter",
  "coffee",
  "chef-hat",
  "wine",
  "flame",
  "pizza",
  "cake",
  "bike",
  "spray",
  "concierge",
  "bed",
  "shirt",
  "users",
  "shield",
] as const;
export type TeamJobIcon = (typeof TEAM_JOB_ICONS)[number];
