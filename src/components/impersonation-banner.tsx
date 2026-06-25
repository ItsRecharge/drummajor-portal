import { stopImpersonationAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

// Discreet banner shown while an admin is impersonating another user.
export function ImpersonationBanner({ targetName }: { targetName: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>
        Viewing as <strong>{targetName}</strong>
      </span>
      <form action={stopImpersonationAction}>
        <Button type="submit" size="sm" variant="outline">
          Stop
        </Button>
      </form>
    </div>
  );
}
