import { TEAM_ICONS } from "./job-meta";
import type { TeamJobIcon } from "@/lib/team-jobs";
import { Users } from "lucide-react";

/** A job's icon by its key (unknown keys show the team icon). */
export function TeamIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEAM_ICONS[name as TeamJobIcon] ?? Users;
  return <Icon className={className} aria-hidden="true" />;
}
