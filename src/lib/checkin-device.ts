// The student's phone is identified by a random token in a long-lived
// HttpOnly cookie (mirrored in localStorage by the check-in form as a backup).
// Only its sha256 is stored — see hashDeviceToken in checkin-token.ts. The
// check-in form asks /checkin/device for it on load (see that route for why).
export const DEVICE_COOKIE = "dm_device";

const MAX_AGE_S = 400 * 24 * 60 * 60; // the longest browsers keep a cookie

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_S,
  };
}

export const DEVICE_TOKEN_RE = /^[a-f0-9]{64}$/;
