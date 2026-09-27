import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { DocumentView } from "@/features/sales/document-view";
import { PrintButton } from "@/features/sales/print-button";
import { authorizePage } from "@/lib/auth/page";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { quotationService } from "@/server/services/quotation.service";
import { shellService } from "@/server/services/shell.service";

export const metadata: Metadata = { title: "Print" };

/** Printer-friendly page (same content as the PDF). Permission and company are checked like everywhere else. */
export default async function PrintQuotationPage({ params }: PageProps<"/print/quotations/[id]">) {
  const ctx = await authorizePage("quotations:view");
  if (!ctx) return <AccessDenied />;
  const { view } = await orNotFound(
    quotationService.presentation(ctx, recordIdOrNotFound((await params).id)),
  );
  const shell = await shellService.getContext(ctx);
  return (
    <>
      <PrintButton />
      <DocumentView view={view} logoUrl={shell.company.logoUrl} />
    </>
  );
}
