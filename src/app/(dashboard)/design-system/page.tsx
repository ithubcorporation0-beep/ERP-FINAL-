import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignSystemShowcase } from "@/features/design-system/showcase";

export const metadata: Metadata = { title: "Design system" };

/** Component reference for developers. Never available in production builds. */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignSystemShowcase />;
}
