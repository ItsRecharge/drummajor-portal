import { stopImpersonationAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

// Discreet banner shown while an admin is impersonating another user.
export function ImpersonationBanner({ targetName }: { targetName: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-sm text-foreground">
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
