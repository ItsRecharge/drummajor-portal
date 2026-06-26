"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ChevronUp, MessageCircle, Plus, X } from "lucide-react";
import { emptyState } from "@/lib/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Deterministic small tilt per note so the wall looks hand-pinned but stays put
// across renders. Range roughly -5°..+5°, derived from the id.
function rotationOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.round((((Math.abs(h) % 100) / 10) - 5) * 10) / 10;
}

export function NoteBoard({ notes }: { notes: Note[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const active = notes.find((n) => n.id === activeId) ?? null;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Drag notes anywhere. Vote and comment to surface the best ideas.
        </p>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="field-grid grid h-[60vh] min-h-[360px] place-items-center rounded-lg border border-border bg-card/30 text-center">
          <p className="text-sm text-muted-foreground">
            No ideas yet. Hit <span className="font-medium text-foreground">Add note</span> to pin the first one.
          </p>
        </div>
      ) : (
        <DraggableBoard notes={notes} onOpenComments={setActiveId} />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New idea</DialogTitle>
          </DialogHeader>
          <NewNoteForm onAdded={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent>{active ? <CommentThread note={active} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}

function NewNoteForm({ onAdded }: { onAdded: () => void }) {
  const [state, formAction] = useActionState(createNoteAction, emptyState);
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (state.success) onAdded();
  }, [state, onAdded]);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="color" value={color} />
      <div className="grid gap-1.5">
        <Label htmlFor="text">Idea</Label>
        <Textarea id="text" name="text" rows={3} placeholder="What's on your mind?" />
        {state.fieldErrors?.text ? (
          <p className="text-sm text-destructive">{state.fieldErrors.text}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className={`size-7 rounded-full border transition ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <input
        name="category"
        placeholder="Category (optional)"
        className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="anonymous" />
        Hide my name
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding…">Add note</SubmitButton>
      </div>
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
    <div className="field-grid relative h-[68vh] min-h-[440px] w-full touch-pan-y overflow-hidden rounded-lg border border-border bg-card/30">
      {notes.map((n) => {
        const pos = posOf(n);
        return (
          <div
            key={n.id}
            onPointerDown={(e) => onPointerDown(e, n)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={
              {
                left: pos.x,
                top: pos.y,
                backgroundColor: n.color,
                "--rot": `${rotationOf(n.id)}deg`,
              } as React.CSSProperties
            }
            className="group absolute w-52 cursor-grab touch-none p-3.5 text-neutral-900 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)] transition-transform duration-150 [transform:rotate(var(--rot))] hover:z-10 hover:[transform:rotate(0deg)_scale(1.03)] active:cursor-grabbing active:[transform:rotate(0deg)_scale(1.03)]"
          >
            {/* A strip of "tape" pinning the note to the wall. */}
            <span className="pointer-events-none absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 -rotate-3 bg-white/35 shadow-sm ring-1 ring-black/5" />
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
      <p className="break-words whitespace-pre-wrap">{note.text}</p>
      {note.category ? (
        <Badge variant="outline" className="w-fit border-neutral-400/60 text-neutral-700">
          {note.category}
        </Badge>
      ) : null}
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span className="truncate">{note.authorName ?? "Anonymous"}</span>
        <div className="flex items-center gap-1" data-no-drag>
          <form action={toggleVoteAction}>
            <input type="hidden" name="noteId" value={note.id} />
            <button
              type="submit"
              className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-black/5 ${note.voted ? "font-semibold text-neutral-900" : ""}`}
            >
              <ChevronUp className="size-3.5" /> {note.votes}
            </button>
          </form>
          <button
            type="button"
            onClick={onOpenComments}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-black/5"
          >
            <MessageCircle className="size-3.5" /> {note.comments.length}
          </button>
          {note.canDelete ? (
            <form action={deleteNoteAction}>
              <input type="hidden" name="noteId" value={note.id} />
              <button type="submit" aria-label="Delete note" className="rounded px-1 py-0.5 hover:bg-black/5">
                <X className="size-3.5" />
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
