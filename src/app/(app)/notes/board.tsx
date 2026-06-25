"use client";

import { useActionState, useRef, useState, type PointerEvent } from "react";
import { emptyState } from "@/lib/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createNoteAction,
  updateNotePositionAction,
  deleteNoteAction,
  toggleVoteAction,
  addCommentAction,
} from "./actions";

type Comment = { id: string; text: string; author: string; createdAt: string };
type Note = {
  id: string;
  text: string;
  color: string;
  category: string | null;
  x: number;
  y: number;
  authorName: string | null;
  canDelete: boolean;
  votes: number;
  voted: boolean;
  comments: Comment[];
};

const COLORS = ["#fff3a0", "#ffd1dc", "#cfe8ff", "#d7f5cc", "#e6d7ff", "#ffd8a8"];

export function NoteBoard({ notes }: { notes: Note[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = notes.find((n) => n.id === activeId) ?? null;

  return (
    <div className="grid gap-4">
      <NewNoteForm />

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ideas yet. Add the first one above.</p>
      ) : (
        <>
          {/* Desktop: draggable Post-it wall. */}
          <DraggableBoard notes={notes} onOpenComments={setActiveId} />
          {/* Mobile: scrollable card list (no drag). */}
          <div className="grid gap-3 md:hidden">
            {notes.map((n) => (
              <div key={n.id} className="rounded-md p-3 shadow-sm" style={{ backgroundColor: n.color }}>
                <NoteBody note={n} onOpenComments={() => setActiveId(n.id)} />
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent>
          {active ? <CommentThread note={active} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewNoteForm() {
  const [state, formAction] = useActionState(createNoteAction, emptyState);
  const [color, setColor] = useState(COLORS[0]);
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="color" value={color} />
      <div className="grid gap-1.5">
        <Label htmlFor="text">New idea</Label>
        <Textarea id="text" name="text" rows={2} placeholder="What's on your mind?" />
        {state.fieldErrors?.text ? (
          <p className="text-sm text-destructive">{state.fieldErrors.text}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-foreground ring-offset-1" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          name="category"
          placeholder="Category (optional)"
          className="h-9 w-48 rounded-md border bg-transparent px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="anonymous" />
          Hide my name
        </label>
        <SubmitButton pendingLabel="Adding…">Add note</SubmitButton>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}

function DraggableBoard({
  notes,
  onOpenComments,
}: {
  notes: Note[];
  onOpenComments: (id: string) => void;
}) {
  // Local position overrides applied during/after a drag; fall back to the
  // server-provided coordinates for notes we haven't moved this session.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  function posOf(n: Note) {
    return positions[n.id] ?? { x: n.x, y: n.y };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>, n: Note) {
    // Don't start a drag from interactive controls inside the note.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const cur = posOf(n);
    drag.current = { id: n.id, offsetX: e.clientX - cur.x, offsetY: e.clientY - cur.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const x = Math.max(0, e.clientX - d.offsetX);
    const y = Math.max(0, e.clientY - d.offsetY);
    setPositions((p) => ({ ...p, [d.id]: { x, y } }));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const pos = positions[d.id];
    if (pos) void updateNotePositionAction(d.id, pos.x, pos.y);
  }

  return (
    <div className="relative hidden h-[600px] w-full overflow-hidden rounded-lg border bg-muted/30 md:block">
      {notes.map((n) => {
        const pos = posOf(n);
        return (
          <div
            key={n.id}
            onPointerDown={(e) => onPointerDown(e, n)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute w-56 cursor-grab touch-none rounded-md p-3 shadow-md active:cursor-grabbing"
            style={{ left: pos.x, top: pos.y, backgroundColor: n.color }}
          >
            <NoteBody note={n} onOpenComments={() => onOpenComments(n.id)} />
          </div>
        );
      })}
    </div>
  );
}

function NoteBody({ note, onOpenComments }: { note: Note; onOpenComments: () => void }) {
  return (
    <div className="grid gap-2 text-sm text-neutral-900">
      <p className="whitespace-pre-wrap break-words">{note.text}</p>
      {note.category ? (
        <Badge variant="outline" className="w-fit border-neutral-400/60 text-neutral-700">
          {note.category}
        </Badge>
      ) : null}
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{note.authorName ?? "Anonymous"}</span>
        <div className="flex items-center gap-1" data-no-drag>
          <form action={toggleVoteAction}>
            <input type="hidden" name="noteId" value={note.id} />
            <button
              type="submit"
              className={`rounded px-1.5 py-0.5 hover:bg-black/5 ${note.voted ? "font-semibold text-neutral-900" : ""}`}
            >
              ▲ {note.votes}
            </button>
          </form>
          <button
            type="button"
            onClick={onOpenComments}
            className="rounded px-1.5 py-0.5 hover:bg-black/5"
          >
            💬 {note.comments.length}
          </button>
          {note.canDelete ? (
            <form action={deleteNoteAction}>
              <input type="hidden" name="noteId" value={note.id} />
              <button type="submit" className="rounded px-1.5 py-0.5 hover:bg-black/5">
                ✕
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CommentThread({ note }: { note: Note }) {
  const [state, formAction] = useActionState(addCommentAction, emptyState);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">{note.text}</DialogTitle>
      </DialogHeader>
      <div className="grid max-h-64 gap-3 overflow-y-auto">
        {note.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          note.comments.map((c) => (
            <div key={c.id} className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2">
              <p className="text-sm">{c.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.author} · {c.createdAt}
              </p>
            </div>
          ))
        )}
      </div>
      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="noteId" value={note.id} />
        <Textarea name="text" rows={2} placeholder="Add a comment…" />
        {state.fieldErrors?.text ? (
          <p className="text-sm text-destructive">{state.fieldErrors.text}</p>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Posting…">Comment</SubmitButton>
        </div>
      </form>
    </>
  );
}
