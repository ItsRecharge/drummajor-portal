import { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";

// Native select bound to FormData by name — keeps Server Action forms simple.
export function RoleSelect({
  name,
  roles,
  defaultValue,
  id,
}: {
  name: string;
  roles: Role[];
  defaultValue?: Role;
  id?: string;
}) {
  return (
    <select
      id={id ?? name}
      name={name}
      defaultValue={defaultValue}
      className="border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs"
    >
      {roles.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r)}
        </option>
      ))}
    </select>
  );
}
