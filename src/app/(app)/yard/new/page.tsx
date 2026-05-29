import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth";
import YardPeriodEditor from "@/components/YardPeriodEditor";

export const dynamic = "force-dynamic";

export default async function NewYardPeriodPage() {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  return <YardPeriodEditor initial={null} />;
}
