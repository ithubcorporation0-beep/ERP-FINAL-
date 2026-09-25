"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { findNavItem, findNavSection } from "@/config/navigation";

export interface Crumb {
  label: string;
  href?: string;
}

/** Derives "Section / Page" from the URL and the navigation config. Detail pages can pass `items`. */
export function useNavCrumbs(): Crumb[] {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  if (!item) return [];
  const section = findNavSection(item.href);
  const crumbs: Crumb[] = [];
  if (section && section.title !== item.label) crumbs.push({ label: section.title });
  crumbs.push({ label: item.label, href: pathname === item.href ? undefined : item.href });
  return crumbs;
}

export function Breadcrumbs({ items }: { items?: Crumb[] }) {
  const derived = useNavCrumbs();
  const crumbs = items ?? derived;
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
