import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { isAllowedEmail } from "@/lib/allowlist";

// Shared zod schemas for Server Action inputs. Email fields that create accounts
// also enforce the school-domain allowlist.

const password = z.string().min(8, "Password must be at least 8 characters");
const allowlistedEmail = z
  .email("Enter a valid email")
  .refine(isAllowedEmail, "Email must be a @wpsstudent.com or @winchesterps.org address");

export const orgSchema = z.object({
  schoolName: z.string().min(1, "Required"),
  bandName: z.string().min(1, "Required"),
  slug: z
    .string()
    .min(1, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only"),
  baseUrl: z.string().url("Enter a valid URL"),
});

export const firstAdminSchema = z.object({
  name: z.string().min(1, "Required"),
  email: allowlistedEmail,
  password,
});

export const smtpSchema = z.object({
  host: z.string().min(1, "Required"),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.email("Enter a valid email"),
  appPassword: z.string().min(1, "Required"),
  fromName: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Required"),
});

export const inviteSchema = z.object({
  email: allowlistedEmail,
  role: z.enum(Role),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1, "Required"),
  password,
  instrument: z.string().optional(),
  gradYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const resetPasswordSchema = z.object({
  password,
});

export const profileSchema = z.object({
  name: z.string().min(1, "Required"),
  instrument: z.string().optional(),
  gradYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: password,
});

export const changeEmailSchema = z.object({
  password: z.string().min(1, "Required"),
  newEmail: allowlistedEmail,
});

export const adminEditUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, "Required"),
  email: allowlistedEmail,
  role: z.enum(Role),
});

export const godModeCredsSchema = z.object({
  userId: z.string().min(1),
  newEmail: allowlistedEmail.optional(),
  newPassword: password.optional(),
});

// Roster contacts are external directory entries (not login accounts), so their
// email is validated for shape only — the school-domain allowlist does not apply.
const grade = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().min(1).max(12).optional(),
);

export const contactSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.email("Enter a valid email"),
  instrument: z.string().optional(),
  grade,
});

export const editContactSchema = contactSchema.extend({
  contactId: z.string().min(1),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Required"),
});

// datetime-local inputs arrive as "" when blank; coerce to a Date otherwise.
const optionalDateTime = z.preprocess(
  (v) => (v === "" || v == null ? undefined : new Date(String(v))),
  z.date({ message: "Enter a valid date" }).optional(),
);

const requiredDateTime = z.preprocess(
  (v) => (v === "" || v == null ? undefined : new Date(String(v))),
  z.date({ message: "Enter a valid date" }),
);

export const announcementSchema = z.object({
  subject: z.string().trim().min(1, "Required"),
  bodyHtml: z.string().trim().min(1, "Write a message"),
  // Optional schedule; when in the future the announcement is queued, not sent now.
  scheduledAt: optionalDateTime,
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  subject: z.string().trim().min(1, "Required"),
  bodyHtml: z.string().trim().min(1, "Required"),
});

export const eventSchema = z.object({
  title: z.string().trim().min(1, "Required"),
  description: z.string().optional(),
  date: requiredDateTime,
  time: z.string().optional(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Required"),
  assigneeId: z.string().optional(),
});

export const noteSchema = z.object({
  text: z.string().trim().min(1, "Write something"),
  color: z.string().optional(),
  category: z.string().optional(),
  // Checkbox: present ("on") means hide the author.
  anonymous: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const noteCommentSchema = z.object({
  noteId: z.string().min(1),
  text: z.string().trim().min(1, "Write a comment"),
});

export const handoffNoteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  category: z.enum(["WHAT_WORKED", "WHAT_DIDNT", "TIP"]),
  title: z.string().trim().min(1, "Required"),
  bodyHtml: z.string().trim().min(1, "Write something"),
});

