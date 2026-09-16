import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { getYardMoney, type YardMoney } from "@/lib/yard-money";
import { findClashes } from "@/lib/yard-schedule";
import type {
  Role,
  VesselZone,
  YardConflictRule,
  YardPeriod,
  YardQuadrant,
  YardTask,
} from "@/lib/types";

// Everything the frame around a yard period needs: the period itself, the
// money strip, and the clash count for the Timeline tab badge.
//
// One loader for all four tabs so the header shows the same numbers wherever
// you are. The money strip is only computed for admins — crew don't see it.
export interface YardPeriodContext {
  period: YardPeriod | null;
  role: Role;
  isAdmin: boolean;
  quadrants: YardQuadrant[];
  tasks: YardTask[];
  zones: VesselZone[];
  rules: YardConflictRule[];
  money: YardMoney | null;
  clashCount: number;
}

export async function loadYardPeriod(id: string): Promise<YardPeriodContext> {
  const supabase = await createClient();
  const role = await getUserRole();
  const isAdmin = role === "admin";

  const [
    { data: period },
    { data: quadrants },
    { data: tasks },
    { data: zones },
    { data: rules },
  ] = await Promise.all([
    supabase.from("yard_periods").select().eq("id", id).single<YardPeriod>(),
    supabase
      .from("yard_quadrants")
      .select()
      .eq("yard_period_id", id)
      .order("display_order")
      .returns<YardQuadrant[]>(),
    supabase
      .from("yard_tasks")
      .select()
      .eq("yard_period_id", id)
      .order("created_at", { ascending: true })
      .returns<YardTask[]>(),
    supabase
      .from("vessel_zones")
      .select()
      .eq("active", true)
      .order("display_order")
      .returns<VesselZone[]>(),
    supabase
      .from("yard_conflict_rules")
      .select()
      .eq("active", true)
      .returns<YardConflictRule[]>(),
  ]);

  const allTasks = tasks ?? [];
  const allZones = zones ?? [];
  const allRules = rules ?? [];

  return {
    period: period ?? null,
    role,
    isAdmin,
    quadrants: quadrants ?? [],
    tasks: allTasks,
    zones: allZones,
    rules: allRules,
    money: period && isAdmin ? await getYardMoney(supabase, id) : null,
    clashCount: findClashes(allTasks, allRules, allZones).length,
  };
}
