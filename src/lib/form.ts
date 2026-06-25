import type { z } from "zod";

// Standard shape returned by every Server Action, consumed by useActionState on
// the client. `fieldErrors` maps field name -> first message; `error` is a
// form-level message; `success`/`message` signal a completed action.
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  message?: string;
};

export const emptyState: ActionState = {};

// Parse FormData with a zod schema, returning either flattened field errors or
// the typed data. Keeps every action's validation boilerplate to one call.
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; state: ActionState } {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, state: { fieldErrors, error: "Please fix the errors below." } };
}
