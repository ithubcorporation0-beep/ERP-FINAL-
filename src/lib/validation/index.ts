import { z } from "zod";

/** Route/record ids are UUIDs; validating first turns bad ids into a 404 instead of a database error. */
export const idSchema = z.uuid("Invalid id.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().toLowerCase().optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  taxId: z.string().trim().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(1, "Enter your password.").max(200),
});

/** Password policy: long rather than complex (NIST SP 800-63B). Checked in the browser and on the server. */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((value) => value.trim().length === value.length, "Remove spaces at the start or end.");

const newPasswordFields = {
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Repeat the new password."),
};

function passwordsMatch(values: { password: string; confirmPassword: string }) {
  return values.password === values.confirmPassword;
}
const mismatch = { message: "The passwords don't match.", path: ["confirmPassword"] };

const personName = z.string().trim().min(2, "Enter your full name.").max(100);
const email = z.email("Enter a valid email address.").toLowerCase().max(254);
/** Single-use link tokens are 43-character base64url strings. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link is invalid.");

export const registerSchema = z
  .object({
    companyName: z.string().trim().min(2, "Enter your company name.").max(120),
    name: personName,
    email,
    ...newPasswordFields,
  })
  .refine(passwordsMatch, mismatch)
  .refine((values) => values.password.toLowerCase() !== values.email, {
    message: "Your password can't be your email address.",
    path: ["password"],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ token: tokenSchema, ...newPasswordFields })
  .refine(passwordsMatch, mismatch);

export const acceptInvitationSchema = z
  .object({ token: tokenSchema, name: personName, ...newPasswordFields })
  .refine(passwordsMatch, mismatch);

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), ...newPasswordFields })
  .refine(passwordsMatch, mismatch)
  .refine((values) => values.password !== values.currentPassword, {
    message: "Choose a password you haven't used here.",
    path: ["password"],
  });

export const profileSchema = z.object({
  name: personName,
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s().-]*$/, "Use digits, spaces and + ( ) - only."),
  jobTitle: z.string().trim().max(80),
});

export const inviteMemberSchema = z.object({ name: personName, email, roleId: idSchema });

export const changeMemberRoleSchema = z.object({ membershipId: idSchema, roleId: idSchema });

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(60),
  description: z.string().trim().max(200),
  permissions: z.array(z.string()).max(500),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
