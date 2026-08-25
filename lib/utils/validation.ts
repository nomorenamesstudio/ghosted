import { z } from "zod";
import {
  applicationStatusEnum,
  milestoneStatusEnum,
} from "@/lib/db/schema";
import { isSafeHttpUrl } from "./sanitize";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                    */
/* ------------------------------------------------------------------ */

export const emailSchema = z
  .email("A valid email is required")
  .trim()
  .toLowerCase()
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const optionalUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(isSafeHttpUrl, {
    message: "URL must be a valid http(s) URL",
  })
  .optional()
  .nullable();

const optionalLongText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const optionalEmailText = z
  .email("Enter a valid email address")
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .nullable();

/** ISO-8601 date string → Date (or null). */
const optionalDateSchema = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "Invalid date",
  })
  .transform((s) => new Date(s))
  .optional()
  .nullable();

/* ------------------------------------------------------------------ */
/* Applications                                                         */
/* ------------------------------------------------------------------ */

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  role: z.string().trim().min(1, "Role is required").max(200),
  url: optionalUrlSchema,
  contactName: optionalLongText(200),
  contactEmail: optionalEmailText,
  contactPhone: optionalLongText(40),
  notes: optionalLongText(10_000),
});

export const updateApplicationSchema = z
  .object({
    company: z.string().trim().min(1).max(200).optional(),
    role: z.string().trim().min(1).max(200).optional(),
    url: optionalUrlSchema,
    contactName: optionalLongText(200),
    contactEmail: optionalEmailText,
    contactPhone: optionalLongText(40),
    notes: optionalLongText(10_000),
    status: z.enum(applicationStatusEnum.enumValues).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

export const listApplicationsQuerySchema = z.object({
  status: z
    .enum([...applicationStatusEnum.enumValues, "ghosted"])
    .optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["company", "status", "updated_at"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */
/* Milestones                                                           */
/* ------------------------------------------------------------------ */

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  // 0-based insertion position; omitted → append at the end.
  position: z.number().int().min(0).optional(),
  date: optionalDateSchema,
  comment: optionalLongText(5_000),
});

export const updateMilestoneSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(milestoneStatusEnum.enumValues).optional(),
    date: optionalDateSchema,
    comment: optionalLongText(5_000),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(200),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    email: emailSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: "At least one field must be provided",
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, "Invalid reset token").max(300),
  password: passwordSchema,
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
