"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Submit button that disables + relabels while its form's action is pending.
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className={className} formAction={formAction}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
