"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Opens the print dialog once the page has loaded, and offers a button to print again. */
export function PrintButton() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Button type="button" onClick={() => window.print()} className="mb-4 print:hidden">
      <Printer aria-hidden="true" />
      Print
    </Button>
  );
}
