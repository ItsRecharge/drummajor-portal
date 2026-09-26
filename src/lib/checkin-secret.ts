import { getMasterKey } from "@/lib/crypto";
import { deriveCheckInSecret } from "@/lib/checkin-token";

// The HMAC key behind QR tokens and tickets, derived once per process from
// APP_ENCRYPTION_KEY (dev fallback included) so nothing new is configured.
let cached: Buffer | null = null;

export function checkInSecret(): Buffer {
  return (cached ??= deriveCheckInSecret(getMasterKey()));
}
