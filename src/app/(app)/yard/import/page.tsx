import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth";
import YardImportFlow from "@/components/YardImportFlow";

export const dynamic = "force-dynamic";

export default async function YardImportPage() {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  return <YardImportFlow />;
}
