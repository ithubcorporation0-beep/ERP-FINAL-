"use client";

import { CalendarClock, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatusKey } from "@/config/crm";
import { cn } from "@/lib/utils";
import { setLeadStatusAction } from "@/server/actions/lead.actions";
import { LEAD_STATUS_TONES } from "./labels";

export interface BoardLead {
  id: string;
  code: string;
  name: string;
  companyName: string | null;
  status: LeadStatusKey;
  /** Decimal string in the company currency, or null. */
  expectedValue: string | null;
  expectedValueLabel: string | null;
  followUpLabel: string | null;
  followUpOverdue: boolean;
  assigneeName: string | null;
}

export interface BoardColumn {
  status: LeadStatusKey;
  leads: BoardLead[];
  /** All leads in the stage (the column may show fewer). */
  total: number;
  /** Sum of expected values in the stage (decimal string). */
  expectedValue: string | null;
}

const TOP_BORDER: Record<string, string> = {
  info: "border-t-info",
  warning: "border-t-warning",
  success: "border-t-success",
  danger: "border-t-danger",
  neutral: "border-t-neutral",
};

type Move = { lead: BoardLead; to: LeadStatusKey };

/** Drag data type for a lead id (checked on drag-over, so drops work even while a previous move is saving). */
const DRAG_TYPE = "application/x-erp-lead";

function applyMove(columns: BoardColumn[], { lead, to }: Move): BoardColumn[] {
  const value = Number(lead.expectedValue ?? 0);
  return columns.map((column) => {
    if (column.status === lead.status) {
      return {
        ...column,
        leads: column.leads.filter((item) => item.id !== lead.id),
        total: column.total - 1,
        expectedValue: String(Number(column.expectedValue ?? 0) - value),
      };
    }
    if (column.status === to) {
      return {
        ...column,
        leads: [{ ...lead, status: to }, ...column.leads],
        total: column.total + 1,
        expectedValue: String(Number(column.expectedValue ?? 0) + value),
      };
    }
    return column;
  });
}

interface LeadBoardProps {
  columns: BoardColumn[];
  canEdit: boolean;
  locale: string;
  currency: string;
}

/**
 * Kanban pipeline. Drag a card to another column, or use its "Move to" menu (keyboard and touch friendly).
 * Moves show immediately and are saved on the server; a failed save puts the card back and explains why.
 */
export function LeadBoard({ columns: saved, canEdit, locale, currency }: LeadBoardProps) {
  const router = useRouter();
  const [columns, optimisticMove] = useOptimistic(saved, applyMove);
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStatusKey | null>(null);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });

  function move(lead: BoardLead, to: LeadStatusKey) {
    if (lead.status === to) return;
    startTransition(async () => {
      optimisticMove({ lead, to });
      const result = await setLeadStatusAction({ id: lead.id, status: to });
      if (result.ok) toast.success(`${lead.name} moved to ${LEAD_STATUS_LABELS[to]}.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <ol className="flex snap-x gap-3" aria-label="Lead pipeline">
        {columns.map((column) => (
          <li
            key={column.status}
            aria-label={`${LEAD_STATUS_LABELS[column.status]}: ${column.total} leads`}
            className={cn(
              "flex w-72 shrink-0 snap-start flex-col rounded-xl border border-t-4 bg-muted/40",
              TOP_BORDER[LEAD_STATUS_TONES[column.status]],
              over === column.status && "ring-2 ring-ring",
            )}
            onDragOver={(event) => {
              if (!canEdit || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOver(column.status);
            }}
            onDragLeave={() => setOver((current) => (current === column.status ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData(DRAG_TYPE);
              const lead = columns.flatMap((item) => item.leads).find((item) => item.id === id);
              if (lead) move(lead, column.status);
              setDraggingId(null);
              setOver(null);
            }}
          >
            <div className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-2">
              <h2 className="text-sm font-semibold">
                {LEAD_STATUS_LABELS[column.status]}{" "}
                <span className="font-normal text-muted-foreground" data-numeric>
                  ({column.total})
                </span>
              </h2>
              <span className="text-xs text-muted-foreground" data-numeric>
                {column.expectedValue && Number(column.expectedValue) !== 0
                  ? money.format(Number(column.expectedValue))
                  : ""}
              </span>
            </div>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {column.leads.map((lead) => (
                <li
                  key={lead.id}
                  aria-label={lead.name}
                  draggable={canEdit}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(DRAG_TYPE, lead.id);
                    setDraggingId(lead.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOver(null);
                  }}
                  className={cn(
                    "rounded-lg border bg-card p-3 shadow-xs",
                    canEdit && "cursor-grab active:cursor-grabbing",
                    draggingId === lead.id && "opacity-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/crm/leads/${lead.id}`}
                        draggable={false}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {lead.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{lead.code}</span>
                        {lead.companyName ? ` · ${lead.companyName}` : ""}
                      </p>
                    </div>
                    {canEdit ? (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Move ${lead.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {LEAD_STATUSES.filter((status) => status !== lead.status).map((status) => (
                            <DropdownMenuItem key={status} onSelect={() => move(lead, status)}>
                              {LEAD_STATUS_LABELS[status]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="font-medium" data-numeric>
                      {lead.expectedValueLabel ?? ""}
                    </span>
                    {lead.followUpLabel ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          lead.followUpOverdue ? "font-medium text-danger" : "text-muted-foreground",
                        )}
                      >
                        <CalendarClock className="size-3.5" aria-hidden="true" />
                        {lead.followUpLabel}
                        {lead.followUpOverdue ? <span className="sr-only"> (overdue)</span> : null}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{lead.assigneeName ?? "Unassigned"}</p>
                </li>
              ))}
              {column.leads.length === 0 ? (
                <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No leads
                </li>
              ) : null}
            </ul>
            {column.total > column.leads.length ? (
              <p className="px-3 pb-3 text-xs text-muted-foreground">
                Showing {column.leads.length} of {column.total}.{" "}
                <Link href={`/crm/leads?status=${column.status}`} className="text-primary hover:underline">
                  See all
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
