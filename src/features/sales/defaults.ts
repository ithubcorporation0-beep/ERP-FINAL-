import type { LineItemInput } from "@/lib/validation";

/**
 * Form defaults. Kept out of the "use client" components so server pages can use them: a server component only
 * sees a client module's exports as references, so spreading one there would produce an empty object.
 */
export const EMPTY_LINE: LineItemInput = {
  description: "",
  quantity: "1",
  unitPrice: "0",
  discountPercent: "0",
  taxRate: "0",
};
