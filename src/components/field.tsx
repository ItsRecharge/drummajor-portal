import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Labeled input with inline error text, driven by a fieldErrors map from an
// ActionState. Keeps every form terse and consistent.
export function Field({
  label,
  name,
  error,
  type = "text",
  defaultValue,
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={!!error}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
