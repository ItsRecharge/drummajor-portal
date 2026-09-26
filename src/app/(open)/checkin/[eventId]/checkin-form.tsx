"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LocateFixed } from "lucide-react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { MAX_ACCURACY_M } from "@/lib/checkin-rules";
import { checkInAction, type CheckInState } from "../actions";

type Fix = { lat: number; lng: number; accuracyM: number };
type GeoState = "idle" | "locating" | "found" | "denied" | "failed" | "unsupported";

const DEVICE_KEY = "dm_device";
const empty: CheckInState = {};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeStyle: "short" });
}

// The student's form: location first (a button, since some phones only prompt
// on a tap; we also try once on load), then their name. The submit is held
// until there's a usable fix.
export function CheckInForm({ eventId, ticket }: { eventId: string; ticket: string }) {
  const [state, action] = useActionState(checkInAction, empty);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");
  // "Edit" applies to the result it was clicked on; a new result ends editing.
  const [editingFor, setEditingFor] = useState<CheckInState | null>(null);
  const editing = editingFor === state;
  const hintRef = useRef<HTMLInputElement>(null);

  // Get the phone's device cookie now (see /checkin/device), passing the
  // localStorage copy so a cleared cookie comes back as the same phone. The
  // token also goes into the hidden field as a backup — a DOM write, not state.
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(DEVICE_KEY) ?? "";
    } catch {
      // storage blocked — the cookie alone will do
    }
    if (hintRef.current) hintRef.current.value = stored;
    fetch("/checkin/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hint: stored }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ token?: string }>) : null))
      .then((data) => {
        if (!data?.token) return;
        if (hintRef.current) hintRef.current.value = data.token;
        try {
          localStorage.setItem(DEVICE_KEY, data.token);
        } catch {
          // storage blocked
        }
      })
      .catch(() => {
        // offline for a moment — the submit action sets the cookie instead
      });
  }, []);

  useEffect(() => {
    if (!state.success) return;
    if (state.deviceToken) {
      try {
        localStorage.setItem(DEVICE_KEY, state.deviceToken);
      } catch {
        // storage blocked — the cookie alone will do
      }
    }
  }, [state]);

  // Callbacks only — safe to start from an effect.
  const requestFix = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy });
        setGeo("found");
      },
      (err) => {
        setFix(null);
        setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "failed");
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, []);

  const supported = () =>
    typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;

  const locate = () => {
    if (!supported()) {
      setGeo("unsupported");
      return;
    }
    setGeo("locating");
    requestFix();
  };

  // One automatic try on load; phones that only prompt on a tap get the button.
  useEffect(() => {
    if (supported()) requestFix();
  }, [requestFix]);

  if (state.success && !editing) {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            You&apos;re checked in as <strong>{state.contactName}</strong>
            {state.checkedInAt ? ` at ${formatTime(state.checkedInAt)}` : ""}.
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Wrong name?{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setEditingFor(state)}>
            Edit
          </button>
        </p>
      </div>
    );
  }

  const imprecise = fix !== null && fix.accuracyM > MAX_ACCURACY_M;
  const ready = fix !== null && !imprecise;

  let geoText: string;
  switch (geo) {
    case "locating":
      geoText = "Getting your location…";
      break;
    case "found":
      geoText = imprecise
        ? `Your location is only accurate to about ${Math.round(fix!.accuracyM)} m. Turn on precise location and try again.`
        : `Location found (±${Math.round(fix!.accuracyM)} m).`;
      break;
    case "denied":
      geoText = "Location is blocked. Allow location for this site in your browser settings, then try again.";
      break;
    case "failed":
      geoText = "Couldn't get your location. Move outdoors or near a window and try again.";
      break;
    case "unsupported":
      geoText = "This browser can't share its location. Open the link in Safari or Chrome.";
      break;
    default:
      geoText = "Location is required to check in.";
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="ticket" value={ticket} />
      <input type="hidden" name="deviceHint" ref={hintRef} defaultValue="" />
      <input type="hidden" name="lat" value={fix?.lat ?? ""} />
      <input type="hidden" name="lng" value={fix?.lng ?? ""} />
      <input type="hidden" name="accuracyM" value={fix?.accuracyM ?? ""} />

      <div className="grid gap-2 rounded-lg border p-3">
        <p className={ready ? "text-sm text-success" : "text-sm text-muted-foreground"} aria-live="polite">
          {geoText}
        </p>
        {!ready ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={locate} disabled={geo === "locating"}>
              <LocateFixed data-icon="inline-start" />
              {geo === "idle" ? "Share my location" : "Try again"}
            </Button>
          </div>
        ) : null}
      </div>

      <Field
        label="Your name, as it appears on Google Classroom"
        name="name"
        autoComplete="name"
        required
        defaultValue={state.contactName ?? ""}
        placeholder="First Last"
        error={state.fieldErrors?.name}
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Checking in…" className={ready ? undefined : "pointer-events-none opacity-50"}>
          Check in
        </SubmitButton>
      </div>
    </form>
  );
}
