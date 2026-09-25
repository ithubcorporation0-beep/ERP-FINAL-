import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  taxId: z.string().trim().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
