// Email-domain allowlist. Signup/email-change restricted to school domains.
// Enforced at invite acceptance and any email change (see docs/plan.md Security Model).

export const ALLOWED_DOMAINS = ["wpsstudent.com", "winchesterps.org"] as const;

export function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && (ALLOWED_DOMAINS as readonly string[]).includes(domain);
}
