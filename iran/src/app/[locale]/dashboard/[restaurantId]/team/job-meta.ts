import {
  Bike,
  BedDouble,
  CakeSlice,
  Calculator,
  ChefHat,
  Coffee,
  ConciergeBell,
  Crown,
  Flame,
  HandPlatter,
  Pizza,
  Shield,
  Shirt,
  SprayCan,
  Users,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { Job } from "@/lib/jobs";
import type { TeamJobIcon } from "@/lib/team-jobs";

export const JOB_ICONS: Record<Job, LucideIcon> = {
  manager: Crown,
  cashier: Calculator,
  waiter: HandPlatter,
  bar: Coffee,
  kitchen: ChefHat,
};
export const JOB_TONES: Record<Job, string> = {
  manager: "bg-tone-violet/12 text-tone-violet",
  cashier: "bg-tone-emerald/12 text-tone-emerald",
  waiter: "bg-tone-sky/12 text-tone-sky",
  bar: "bg-tone-amber/18 text-tone-amber",
  kitchen: "bg-tone-orange/12 text-tone-orange",
};

/** The 16 icons a restaurant picks from for its own jobs. */
export const TEAM_ICONS: Record<TeamJobIcon, LucideIcon> = {
  crown: Crown,
  calculator: Calculator,
  "hand-platter": HandPlatter,
  coffee: Coffee,
  "chef-hat": ChefHat,
  wine: Wine,
  flame: Flame,
  pizza: Pizza,
  cake: CakeSlice,
  bike: Bike,
  spray: SprayCan,
  concierge: ConciergeBell,
  bed: BedDouble,
  shirt: Shirt,
  users: Users,
  shield: Shield,
};

export type TeamJobView = { id: string; name: string; icon: string; baseJob: string };
/** A member's job as the restaurant names it: theirs, else the first one built on their base job. */
export const jobOf = (jobs: TeamJobView[], teamJobId: string | null, job: string | null) =>
  jobs.find((j) => j.id === teamJobId) ?? (job ? jobs.find((j) => j.baseJob === job) : undefined);
