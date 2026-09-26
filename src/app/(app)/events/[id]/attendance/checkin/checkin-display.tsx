"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { LocateFixed, QrCode, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECKIN_FLAG_LABELS, isCheckInFlag } from "@/lib/checkin-rules";
import type { SheetSnapshot } from "@/lib/attendance";
import type { CheckInSession } from "@/lib/checkin-data";
import { closeCheckInAction, openCheckInAction } from "../actions";

type TokenInfo = { token: string; expiresAt: number; now: number };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeStyle: "short" });
}

// Rotating QR code plus a live view of who has checked in. The token comes
// from the server each window (the secret never reaches the browser); the
// sheet snapshot arrives over the same SSE stream the roll-call sheet uses.
export function CheckInDisplay({
  eventId,
  initialSession,
  initialSnapshot,
  isToday,
  published,
  baseUrl,
}: {
  eventId: string;
  initialSession: CheckInSession;
  initialSnapshot: SheetSnapshot;
  isToday: boolean;
  published: boolean;
  baseUrl: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [snap, setSnap] = useState(initialSnapshot);
  const [latest, setInfo] = useState<TokenInfo | null>(null);
  // The drawn code, tagged with the URL it encodes so a stale one never shows.
  const [drawn, setDrawn] = useState<{ url: string; data: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [locating, setLocating] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Server clock minus ours, so the countdown matches the server's windows.
  const skew = useRef(0);

  const isOpen = session.isOpen;
  // A drum major may publish from the sheet while this page is open.
  const isPublished = published || snap.publishedAt !== null;
  const closed = isPublished || (session.closedAt !== null && !isOpen);

  // Live sheet: rows (for the check-in list) and the session's open/closed state.
  useEffect(() => {
    const es = new EventSource(`/events/${eventId}/attendance/live`);
    es.addEventListener("snapshot", (e) => {
      const s = JSON.parse((e as MessageEvent<string>).data) as SheetSnapshot;
      setSnap((prev) => (s.version >= prev.version ? s : prev));
      setSession((prev) => ({
        ...prev,
        openedAt: s.checkIn.openedAt,
        closedAt: s.checkIn.closedAt,
        count: s.checkIn.count,
        isOpen: s.checkIn.openedAt !== null && s.checkIn.closedAt === null,
      }));
    });
    return () => es.close();
  }, [eventId]);

  // Fetch a token now, again at each window boundary, and whenever the tab
  // comes back into view.
  useEffect(() => {
    if (!isOpen) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(fetchToken, Math.max(250, ms));
    };
    async function fetchToken() {
      try {
        const res = await fetch(`/events/${eventId}/attendance/checkin/token`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 409) {
          setSession((p) => ({ ...p, isOpen: false, closedAt: p.closedAt ?? new Date().toISOString() }));
          return;
        }
        if (!res.ok) {
          schedule(5000);
          return;
        }
        const data = (await res.json()) as TokenInfo;
        if (stopped) return;
        skew.current = data.now - Date.now();
        setInfo((prev) => (prev?.token === data.token ? prev : data));
        schedule(data.expiresAt - data.now + 100);
      } catch {
        schedule(5000);
      }
    }
    fetchToken();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchToken();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId, isOpen]);

  const info = isOpen ? latest : null;
  const url = info ? `${baseUrl}/checkin/${eventId}?k=${info.token}` : null;
  const qr = drawn && drawn.url === url ? drawn.data : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" })
      .then((data) => {
        if (!cancelled) setDrawn({ url, data });
      })
      .catch(() => toast.error("Couldn't draw the QR code."));
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!info) return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((info.expiresAt - (Date.now() + skew.current)) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  const open = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("This browser can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const anchor = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy };
        startTransition(async () => {
          const r = await openCheckInAction(eventId, anchor);
          if (r.ok) {
            setSession(r.session);
            toast.success("Check-in is open.");
          } else toast.error(r.error);
        });
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Allow location access to open check-in."
            : "Couldn't get your location. Try again outdoors or near a window.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, [eventId]);

  const close = () =>
    startTransition(async () => {
      const r = await closeCheckInAction(eventId);
      if (r.ok) setSession(r.session);
      else toast.error(r.error);
    });

  const checkedIn = useMemo(
    () =>
      snap.rows
        .filter((r) => r.checkedInAt)
        .sort((a, b) => (b.checkedInAt as string).localeCompare(a.checkedInAt as string)),
    [snap.rows],
  );
  const flagged = useMemo(() => snap.rows.filter((r) => r.checkInFlags.length > 0), [snap.rows]);

  const openBlocked = isPublished
    ? "This sheet is published."
    : !isToday
      ? "Only on the day of the event."
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>{isOpen ? "Scan to check in" : closed ? "Check-in closed" : "Check-in not open"}</CardTitle>
          <CardDescription>
            {isOpen
              ? `Students scan this, type their name as it appears on Google Classroom and share their location. Anyone farther than ${session.radiusM} m from where you opened check-in is refused. The code changes every 20 seconds.`
              : isPublished
                ? "Attendance was published, so QR check-in is over. Mark students on the sheet instead."
                : "Opening check-in uses your phone's location as the center of the allowed area, so stand where the band is."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isOpen ? (
            <>
              <div className="mx-auto w-full max-w-md">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URL drawn in the browser
                  <img
                    src={qr}
                    alt="Check-in QR code"
                    data-checkin-url={url ?? undefined}
                    className="aspect-square w-full rounded-lg bg-white p-4"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded-lg border text-sm text-muted-foreground">
                    Getting a code…
                  </div>
                )}
              </div>
              <p className="text-center text-sm text-muted-foreground tabular-nums">
                {info ? `New code in ${secondsLeft}s` : "Getting a code…"}
                {session.openedAt ? ` · opened ${formatTime(session.openedAt)}` : ""}
                {session.openedBy ? ` by ${session.openedBy}` : ""}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                  <Square data-icon="inline-start" /> Close check-in
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={open} disabled={isPending || locating}>
                  <LocateFixed data-icon="inline-start" /> Re-center on my location
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={open} disabled={isPending || locating || openBlocked !== null}>
                <QrCode data-icon="inline-start" />
                {locating ? "Getting your location…" : closed ? "Re-open check-in" : "Open check-in (beta)"}
              </Button>
              {openBlocked ? <span className="text-sm text-muted-foreground">{openBlocked}</span> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="tabular-nums">{session.count}</span> checked in
          </CardTitle>
          <CardDescription>
            Names appear here as students scan. Flags are for you to review — the sheet still takes taps.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {flagged.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="font-medium">Needs a look</p>
              <ul className="grid gap-1">
                {flagged.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-1.5">
                    <span>{r.name}</span>
                    {r.checkInFlags.map((f) => (
                      <Badge key={f} variant="outline" className="h-4 px-1.5 text-[10px]">
                        {isCheckInFlag(f) ? CHECKIN_FLAG_LABELS[f] : f}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <p className="font-medium">Latest</p>
            {checkedIn.length === 0 ? (
              <p className="text-muted-foreground">Nobody yet.</p>
            ) : (
              <ul className="grid gap-1">
                {checkedIn.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatTime(r.checkedInAt as string)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
