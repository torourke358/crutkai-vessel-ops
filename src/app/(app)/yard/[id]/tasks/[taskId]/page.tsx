import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HIDDEN_CREW_ID } from "@/lib/crew";
import { getUserRole } from "@/lib/auth";
import YardTaskEditor from "@/components/YardTaskEditor";
import CompleteYardTaskDialog from "@/components/CompleteYardTaskDialog";
import type { YardQuadrant, YardTask } from "@/lib/types";
import type { PartsAvailable } from "@/components/PartsConsumedPicker";

export const dynamic = "force-dynamic";

export default async function YardTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const supabase = await createClient();
  const role = await getUserRole();

  const [{ data: task }, { data: quadrants }, { data: users }, { data: inventory }] =
    await Promise.all([
      supabase.from("yard_tasks").select().eq("id", taskId).single<YardTask>(),
      supabase
        .from("yard_quadrants")
        .select()
        .eq("yard_period_id", id)
        .order("display_order")
        .returns<YardQuadrant[]>(),
      supabase.from("user_profiles").select("id, full_name").eq("active", true).neq("id", HIDDEN_CREW_ID),
      supabase
        .from("inventory_items")
        .select("id, part_name, part_number, quantity, unit")
        .order("part_name")
        .returns<PartsAvailable[]>(),
    ]);

  if (!task) notFound();

  return (
    <div className="space-y-5 pb-8">
      {/* Mark complete dialog. Admin or owner. */}
      {task.status !== "done" && (role === "admin" || task.owner_id) && (
        <CompleteYardTaskDialog
          periodId={id}
          taskId={taskId}
          availableParts={inventory ?? []}
        />
      )}

      <YardTaskEditor
        periodId={id}
        initial={task}
        quadrants={quadrants ?? []}
        users={users ?? []}
      />
    </div>
  );
}
