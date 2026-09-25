import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ModulePlaceholder href="/projects" />;
}
