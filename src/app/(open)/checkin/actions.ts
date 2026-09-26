"use server";

import { cookies, headers } from "next/headers";
import { parseForm, type ActionState } from "@/lib/form";
import { checkInSubmitSchema } from "@/lib/validation";
import { randomToken } from "@/lib/tokens";
import { DEVICE_COOKIE, DEVICE_TOKEN_RE, deviceCookieOptions } from "@/lib/checkin-device";
import { checkInSecret } from "@/lib/checkin-secret";
import { hashDeviceToken, verifyTicket } from "@/lib/checkin-token";
import { CHECKIN_ERRORS } from "@/lib/checkin-rules";
import { IP_RULE, TICKET_RULE, checkInLimiter } from "@/lib/rate-limit";
import { submitCheckIn } from "@/lib/checkin-data";

export type CheckInState = ActionState & {
  contactName?: string;
  checkedInAt?: string;
  // The raw dm_device token, for the form to mirror into localStorage.
  deviceToken?: string;
};

// Public: a student checks in from the page a scanned QR code opened. The
// ticket proves a fresh scan; the cookie (or its localStorage mirror) names
// the phone; everything else is decided in src/lib/checkin-data.ts.
export async function checkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = parseForm(checkInSubmitSchema, formData);
  if (!parsed.ok) {
    const fe = parsed.state.fieldErrors ?? {};
    if (fe.lat || fe.lng || fe.accuracyM) return { error: CHECKIN_ERRORS.NO_LOCATION };
    return parsed.state;
  }
  const { eventId, ticket, name, lat, lng, accuracyM, deviceHint } = parsed.data;

  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  // /checkin/device normally issued the cookie when the page loaded. Only set it here
  // when it's missing (cleared mid-visit): setting a cookie in an action
  // re-renders the page, which would swap the ticket under the student.
  const jar = await cookies();
  const fromCookie = jar.get(DEVICE_COOKIE)?.value;
  const token = fromCookie && DEVICE_TOKEN_RE.test(fromCookie) ? fromCookie : (deviceHint ?? randomToken());
  if (token !== fromCookie) jar.set(DEVICE_COOKIE, token, deviceCookieOptions());
  const deviceId = hashDeviceToken(token);

  const now = Date.now();
  const hits = [
    checkInLimiter.hit(`ip:${ipAddress ?? "unknown"}`, IP_RULE, now),
    checkInLimiter.hit(`ticket:${ticket}`, TICKET_RULE, now),
    checkInLimiter.hit(`device:${deviceId}`, TICKET_RULE, now),
  ];
  if (hits.some((h) => !h.allowed)) return { error: CHECKIN_ERRORS.RATE_LIMITED };
  if (!verifyTicket(checkInSecret(), eventId, ticket, now)) return { error: CHECKIN_ERRORS.BAD_TICKET };

  const r = await submitCheckIn({
    eventId,
    deviceId,
    typedName: name,
    location: { lat, lng, accuracyM },
    ipAddress,
    userAgent,
    now: new Date(now),
  });
  if (!r.ok) return { error: r.error };
  return {
    success: true,
    message: `You're checked in as ${r.contactName}.`,
    contactName: r.contactName,
    checkedInAt: r.checkedInAt,
    deviceToken: token,
  };
}
