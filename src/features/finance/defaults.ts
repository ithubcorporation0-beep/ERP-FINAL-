import type { ExpenseInput } from "@/lib/validation";

/** Form defaults, outside "use client" modules so server pages can spread them. */
export function emptyExpense(today: string): ExpenseInput {
  return {
    category: "OTHER",
    amount: "",
    expenseDate: today,
    vendor: "",
    paymentMethod: "CARD",
    description: "",
    employeeId: "",
  };
}
