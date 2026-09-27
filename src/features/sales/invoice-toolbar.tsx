"use client";

import { Download, HandCoins, MoreHorizontal, Pencil, Printer, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InvoiceStatusKey } from "@/config/sales";
import {
  cancelInvoiceAction,
  deleteInvoiceAction,
  markInvoiceSentAction,
  sendInvoiceAction,
  shareInvoiceAction,
} from "@/server/actions/invoice.actions";
import { ActionButton, ActionConfirmDialog, type PendingAction } from "./confirm-action";
import { SendDialog } from "./send-dialog";
import { WhatsAppButton } from "./whatsapp-button";

interface InvoiceToolbarProps {
  id: string;
  code: string;
  status: InvoiceStatusKey;
  hasPayments: boolean;
  customer: { email: string | null; phone: string | null };
  whatsappMessage: string;
  can: { edit: boolean; delete: boolean; pay: boolean };
}

export function InvoiceToolbar({
  id,
  code,
  status,
  hasPayments,
  customer,
  whatsappMessage,
  can,
}: InvoiceToolbarProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const draft = status === "DRAFT";
  const payable = status === "SENT" || status === "PARTIALLY_PAID";
  const cancellable = (draft || status === "SENT") && !hasPayments;

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && draft ? (
        <Button asChild variant="outline">
          <Link href={`/sales/invoices/${id}/edit`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      ) : null}
      {can.pay && payable ? (
        <Button asChild>
          <Link href={`/sales/payments/new?invoiceId=${id}`}>
            <HandCoins aria-hidden="true" />
            Record payment
          </Link>
        </Button>
      ) : null}
      {can.edit && status !== "CANCELLED" ? (
        <>
          <SendDialog
            id={id}
            documentLabel={code}
            defaultTo={customer.email ?? ""}
            action={sendInvoiceAction}
          />
          <WhatsAppButton
            createLink={() => shareInvoiceAction(id)}
            phone={customer.phone}
            message={whatsappMessage}
          />
        </>
      ) : null}
      {can.edit && draft ? (
        <ActionButton
          label="Mark as sent"
          icon={<Send aria-hidden="true" />}
          onClick={() =>
            setPending({
              title: "Mark as sent?",
              description:
                "Use this when you gave the invoice to the customer another way. It can't be edited afterwards.",
              confirmLabel: "Mark as sent",
              tone: "default",
              run: () => markInvoiceSentAction(id),
              done: () => {
                toast.success("Invoice marked as sent.");
                router.refresh();
              },
            })
          }
        />
      ) : null}
      <Button asChild variant="outline">
        <a href={`/api/invoices/${id}/pdf?download=1`} download>
          <Download aria-hidden="true" />
          PDF
        </a>
      </Button>
      <Button asChild variant="outline">
        <Link href={`/print/invoices/${id}`} target="_blank">
          <Printer aria-hidden="true" />
          Print
        </Link>
      </Button>
      {(can.edit && cancellable) || (can.delete && draft) ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {can.edit && cancellable ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setPending({
                    title: `Cancel ${code}?`,
                    description: "The invoice stays on record with its number, marked as cancelled.",
                    confirmLabel: "Cancel invoice",
                    tone: "destructive",
                    run: () => cancelInvoiceAction(id),
                    done: () => {
                      toast.success("Invoice cancelled.");
                      router.refresh();
                    },
                  })
                }
              >
                Cancel invoice
              </DropdownMenuItem>
            ) : null}
            {can.delete && draft ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setPending({
                    title: `Delete draft ${code}?`,
                    description: "The draft is removed. Its history stays in the audit log.",
                    confirmLabel: "Delete draft",
                    tone: "destructive",
                    run: () => deleteInvoiceAction(id),
                    done: () => {
                      toast.success("Draft deleted.");
                      router.push("/sales/invoices");
                    },
                  })
                }
              >
                Delete draft
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ActionConfirmDialog action={pending} onClose={() => setPending(null)} />
    </div>
  );
}
