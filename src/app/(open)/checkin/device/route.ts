import type { NextRequest } from "next/server";
import { randomToken } from "@/lib/tokens";
import { DEVICE_COOKIE, DEVICE_TOKEN_RE, deviceCookieOptions } from "@/lib/checkin-device";

// Hands the phone its dm_device cookie as soon as the check-in page loads.
// The submit action could set it too, but setting a cookie from a server
// action makes Next re-render the page — which mints a new ticket and, once
// the scanned code is 40 s old, turns a mistyped name into "QR code expired".
// A route handler sets cookies without touching the page.
//
// Body (optional): { hint } — the localStorage copy, which restores the phone's
// identity if the cookie was cleared but storage wasn't.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const current = req.cookies.get(DEVICE_COOKIE)?.value;
  if (current && DEVICE_TOKEN_RE.test(current)) {
    return Response.json({ token: current }, { headers: { "Cache-Control": "no-store" } });
  }
  let hint: unknown;
  try {
    hint = ((await req.json()) as { hint?: unknown })?.hint;
  } catch {
    hint = undefined;
  }
  const token = typeof hint === "string" && DEVICE_TOKEN_RE.test(hint) ? hint : randomToken();
  const res = Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
  const o = deviceCookieOptions();
  res.headers.append(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${token}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`,
  );
  return res;
}
