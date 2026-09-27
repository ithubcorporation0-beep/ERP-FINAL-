"use client";

import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { switchCompanyAction } from "@/server/actions/company.actions";
import type { ShellCompany } from "@/server/services/shell.service";

interface CompanySwitcherProps {
  current: ShellCompany & { logoUrl: string | null };
  companies: ShellCompany[];
  className?: string;
}

function CompanyMark({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- private, per-company image served by our own API
    <img src={logoUrl} alt="" className="size-6 shrink-0 rounded object-contain" aria-hidden="true" />
  ) : (
    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-label={`${name} (no logo)`} />
  );
}

/**
 * Shows the current company and, for people in several companies, switches between them. Switching is checked
 * on the server (active membership required) — this menu only lists what the server returned.
 */
export function CompanySwitcher({ current, companies, className }: CompanySwitcherProps) {
  const [pending, startTransition] = useTransition();

  if (companies.length <= 1) {
    return (
      <div className={cn("flex min-w-0 items-center gap-2 text-sm font-medium", className)}>
        <CompanyMark logoUrl={current.logoUrl} name={current.name} />
        <span className="truncate" title="Current company">
          {current.name}
        </span>
      </div>
    );
  }

  function switchTo(companyId: string) {
    if (companyId === current.id) return;
    startTransition(async () => {
      const result = await switchCompanyAction(companyId);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-9 max-w-64 justify-start gap-2 px-2 font-medium", className)}
          aria-label={`Current company: ${current.name}. Switch company`}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CompanyMark logoUrl={current.logoUrl} name={current.name} />
          )}
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((company) => (
          <DropdownMenuItem key={company.id} onSelect={() => switchTo(company.id)} className="gap-2">
            <Building2 className="text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{company.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{company.roleName}</span>
            </span>
            {company.id === current.id ? <Check aria-label="Current company" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
