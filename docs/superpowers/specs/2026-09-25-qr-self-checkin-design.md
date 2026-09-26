# QR self check-in (beta) — design

**Date:** 2026-09-25 · **Branch:** `feat/qr-checkin`

## Goal

Let students mark themselves present at band events. A drum major shows a rotating QR code; a student scans it,
types their first and last name as it appears on Google Classroom, shares their location, and shows up as Present
on the live roll-call sheet. A phone can check in once per event (it may fix a mistyped name) and belongs to one
student across events. The drum-major sheet stays the source of truth: any tap there overrides a self check-in.
Decisions made with the user: the phone is identified by a long-lived cookie (browsers expose no hardware id), the
geofence is centered on the drum major's phone when they open check-in, unknown names are rejected with no
suggestions, and a check-in is always Present (lateness is a review flag, not a status).

## Data model

Migration `9b_qr_checkin` (must sort after `9a_event_groups_publish`).

- `AppSettings.checkInEnabled Boolean @default(false)`, `checkInRadiusM Int @default(150)`.
- `Event.checkInOpenedAt/ClosedAt/OpenedById`, `checkInLat/Lng/AccuracyM` (the anchor), `checkInRadiusM`
  (snapshot of the setting at open). Open = opened and not closed.
- `AttendanceRecord.checkedInAt` — set by a self check-in; drives the QR icon.
- `CheckIn { eventId, contactId, deviceId, typedName, lat, lng, accuracyM, distanceM, flags String[], ipAddress,
  userAgent }`, `@@unique([eventId, deviceId])`. There is no Device table: a phone's binding is derived from its
  CheckIn rows, so deleting events or clearing the roster frees phones automatically.

## Device identity

`dm_device` is a random 32-byte hex token in an HttpOnly, SameSite=Lax cookie (400 days). Only its sha256 is
stored. The check-in form calls `POST /checkin/device` on load, which sets the cookie if missing (restoring it from
the localStorage copy when possible) and returns the token for localStorage. The submit action sets the cookie only
as a fallback, because setting a cookie from a server action re-renders the page — minting a new ticket and, once
the scanned token is over 40 s old, replacing the form with "QR code expired".

## Token and ticket

`src/lib/checkin-token.ts`, key = HKDF of `APP_ENCRYPTION_KEY`. Token = first 32 base64url chars of
HMAC(`eventId:window`), window = floor(now / 20 s); the public page accepts the current and previous window.
The drum major's page fetches it from `GET /events/[id]/attendance/checkin/token` (leadership only) at each window
boundary. A valid scan mints a ticket `exp.HMAC("ticket:eventId:exp")` good for 5 minutes, carried in the form.

## Rules

Pure in `src/lib/checkin-rules.ts`, evaluated in this order:

1. Session: enabled, BAND event, opened and not closed with an anchor, event date = today in America/New_York
   (so a session dies at midnight).
2. Location: present; reported accuracy ≤ 200 m; haversine distance ≤ radius.
3. Name: `normalizeName` (NFD, strip marks, lowercase, letters and digits only) must match exactly one contact on
   the event's roster; two matches → "See a drum major."
4. Device: a phone with a CheckIn for a different student at another event is refused by name.

Flags, stored and shown, never rejections: DUP_NAME (another phone claimed this student at this event), NEW_DEVICE
(the student used another phone before), EDGE (distance > 0.7 × radius), LATE (> 10 min after `Event.time`, New
York wall clock). Rate limits (in-process, sliding 60 s): 10 per ticket, 10 per phone, 300 per IP (school Wi-Fi
puts the whole band behind one address).

## Pages and actions

- `/events/[id]/attendance/checkin`: Open / Re-open (captures GPS, refused unless today, unpublished and accuracy
  ≤ 200 m), Close, "Re-center on my location", the QR with countdown, a live count, latest names and flagged
  students via the sheet's SSE stream. Server actions `openCheckInAction` / `closeCheckInAction` audit
  CHECKIN_OPENED / CHECKIN_CLOSED.
- `/checkin/[eventId]?k=` (public, `(open)` group): validates the token, mints the ticket, renders the form.
  `checkInAction` checks limits and ticket, then `submitCheckIn` (`src/lib/checkin-data.ts`) upserts the CheckIn and
  the attendance record in one transaction and broadcasts the sheet.

## Sheet integration

Rows show a QR icon (with time) and flag badges; the status line shows "QR check-in open · N checked in". A self
check-in creates Present, turns an untouched Absent into Present, and otherwise only stamps `checkedInAt`, so a
drum major's Late/Excused — or an Absent set after a scan — is never overwritten. Renaming on the same phone
reverts the previous student's self-made Present to Absent unless another phone also claimed them. Publishing
closes check-in in the same transaction, and a published sheet can't be re-opened.

## Settings

Attendance policy card gains a "QR check-in (beta)" fieldset: enable checkbox and radius (25–2000 m).

## Edge cases

Geolocation needs HTTPS (production is behind Caddy TLS; localhost works in dev). In-app browsers and
private tabs get fresh storage and look like a new phone; DUP_NAME / NEW_DEVICE surface that. GPS can be spoofed;
flags and the drum major's eyes are the control. A forwarded link works for up to ~40 s and only inside the
radius. Rate limiter and live registry are in-process (one `next start`). The repo-root `proxy.ts` is not loaded
by Next in a `src/` app; nothing here depends on it.

## Testing

Unit (`node --test`): `geo`, `name-match`, `checkin-token`, `rate-limit`, `checkin-rules`, plus `attendance`
fixtures. Playwright on the Docker e2e DB with geolocation-enabled contexts: settings toggle; open + rotating QR;
device cookie on load; lowercase name → Present live on the sheet with QR icon and Late flag; Edit moves the mark;
first-name-only rejected; 400 m refused; ±500 m blocked; second phone same name → Duplicate name; 11 tries rate
limited; same phone at another event refused by name; 41-s-old code expired; Publish closes check-in and blocks
re-open; token route needs login.
