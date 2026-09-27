"use client";

import { CheckCircle2, Download, FileOutput, MoreHorizontal, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QuotationStatusKey } from "@/config/sales";
import {
  closeQuotationAction,
  confirmQuotationAction,
  convertQuotationAction,
  deleteQuotationAction,
  duplicateQuotationAction,
  sendQuotationAction,
  shareQuotationAction,
} from "@/server/actions/quotation.actions";
import { ActionButton, ActionConfirmDialog, type PendingAction } from "./confirm-action";
import { SendDialog } from "./send-dialog";
import { WhatsAppButton } from "./whatsapp-button";

interface QuotationToolbarProps {
  id: string;
  /** "QUO-0001" or, for a sales order, "SO-0001". */
  code: string;
  status: QuotationStatusKey;
  customer: { email: string | null; phone: string | null };
  whatsappMessage: string;
  can: { edit: boolean; create: boolean; delete: boolean; invoice: boolean };
}

export function QuotationToolbar({
  id,
  code,
  status,
  customer,
  whatsappMessage,
  can,
}: QuotationToolbarProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const open = status === "DRAFT" || status === "SENT";
  const sendable = open || status === "CONFIRMED";
  const refresh = (message: string) => () => {
    toast.success(message);
    router.refresh();
  };

  const confirm: PendingAction = {
    title: "Mark as accepted?",
    description: "The quotation becomes a sales order with its own number. It can't be edited afterwards.",
    confirmLabel: "Create sales order",
    tone: "default",
    run: () => confirmQuotationAction(id),
    done: refresh("Sales order created."),
  };
  const convert: PendingAction = {
    title: "Convert to invoice?",
    description: "A draft invoice is created with these lines. The quotation is marked as invoiced.",
    confirmLabel: "Create invoice",
    tone: "default",
    run: async () => {
      const result = await convertQuotationAction(id);
      if (result.ok) router.push(`/sales/invoices/${result.data.invoiceId}`);
      return result;
    },
    done: () => toast.success("Invoice created."),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && open ? (
        <Button asChild variant="outline">
          <Link href={`/sales/quotations/${id}/edit`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      ) : null}
      {can.edit && sendable ? (
        <>
          <SendDialog
            id={id}
            documentLabel={code}
            defaultTo={customer.email ?? ""}
            action={sendQuotationAction}
          />
          <WhatsAppButton
            createLink={() => shareQuotationAction(id)}
            phone={customer.phone}
            message={whatsappMessage}
          />
        </>
      ) : null}
      <Button asChild variant="outline">
        <a href={`/api/quotations/${id}/pdf?download=1`} download>
          <Download aria-hidden="true" />
          PDF
        </a>
      </Button>
      <Button asChild variant="outline">
        <Link href={`/print/quotations/${id}`} target="_blank">
          <Printer aria-hidden="true" />
          Print
        </Link>
      </Button>
      {can.edit && open ? (
        <ActionButton
          label="Mark as accepted"
          icon={<CheckCircle2 aria-hidden="true" />}
          onClick={() => setPending(confirm)}
        />
      ) : null}
      {can.edit && can.invoice && sendable ? (
        <ActionButton
          label="Convert to invoice"
          variant="default"
          icon={<FileOutput aria-hidden="true" />}
          onClick={() => setPending(convert)}
        />
      ) : null}

      {can.create || can.edit || can.delete ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {can.create ? (
              <DropdownMenuItem
                onSelect={async () => {
                  const result = await duplicateQuotationAction(id);
                  if (!result.ok) return toast.error(result.error.message);
                  toast.success("Copy created.");
                  router.push(`/sales/quotations/${result.data.id}`);
                }}
              >
                Duplicate
              </DropdownMenuItem>
            ) : null}
            {can.edit && open ? (
              <DropdownMenuItem
                onSelect={() =>
                  setPending({
                    title: "Mark as declined?",
                    description:
                      "The customer turned this quotation down. It can no longer be sent or converted.",
                    confirmLabel: "Mark as declined",
                    tone: "destructive",
                    run: () => closeQuotationAction(id, "DECLINED"),
                    done: refresh("Quotation marked as declined."),
                  })
                }
              >
                Mark as declined
              </DropdownMenuItem>
            ) : null}
            {can.edit && sendable ? (
              <DropdownMenuItem
                onSelect={() =>
                  setPending({
                    title: `Cancel ${code}?`,
                    description: "It stays on record but can no longer be sent or converted.",
                    confirmLabel: "Cancel it",
                    tone: "destructive",
                    run: () => closeQuotationAction(id, "CANCELLED"),
                    done: refresh("Cancelled."),
                  })
                }
              >
                Cancel
              </DropdownMenuItem>
            ) : null}
            {can.delete && ["DRAFT", "DECLINED", "CANCELLED"].includes(status) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    setPending({
                      title: `Delete ${code}?`,
                      description: "It is removed from lists. Its history stays in the audit log.",
                      confirmLabel: "Delete",
                      tone: "destructive",
                      run: () => deleteQuotationAction(id),
                      done: () => {
                        toast.success("Deleted.");
                        router.push("/sales/quotations");
                      },
                    })
                  }
                >
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ActionConfirmDialog action={pending} onClose={() => setPending(null)} />
    </div>
  );
}
