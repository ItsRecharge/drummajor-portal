"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Rich-text editor on Tiptap. Posts sanitized-later HTML through a hidden input
// so it works inside a plain <form action>. Optional `@` mentions: pick an item
// from `mentionItems`; mentions post as <strong>Title</strong> in the HTML and
// their ids are reported through `onMentionsChange` so the form can attach them.

export type MentionItem = { id: string; title: string; subtitle?: string };

type Suggestion = {
  items: MentionItem[];
  index: number;
  top: number;
  left: number;
  command: (attrs: { id: string; label: string }) => void;
};

function filterItems(items: MentionItem[], query: string): MentionItem[] {
  const q = query.trim().toLowerCase();
  const match = q
    ? items.filter((i) => i.title.toLowerCase().includes(q) || (i.subtitle ?? "").toLowerCase().includes(q))
    : items;
  return match.slice(0, 8);
}

// Turn Tiptap's mention <span> nodes into plain <strong> so the server-side
// sanitizer (which strips spans) keeps the piece name readable in the email.
function serialize(editor: Editor): { html: string; mentionIds: string[] } {
  const raw = editor.getHTML();
  if (typeof window === "undefined" || !raw.includes("data-type=\"mention\"")) {
    return { html: raw, mentionIds: [] };
  }
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const ids = new Set<string>();
  doc.querySelectorAll('span[data-type="mention"]').forEach((el) => {
    const id = el.getAttribute("data-id") ?? "";
    const label = el.getAttribute("data-label") ?? el.textContent?.replace(/^@/, "") ?? "";
    if (id) ids.add(id);
    const strong = doc.createElement("strong");
    strong.textContent = label;
    el.replaceWith(strong);
  });
  return { html: doc.body.firstElementChild?.innerHTML ?? raw, mentionIds: [...ids] };
}

export function RichText({
  name,
  initialHtml = "",
  placeholder = "Write your message…",
  onChange,
  onImageUpload,
  mentionItems,
  onMentionsChange,
  className,
}: {
  name: string;
  initialHtml?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onImageUpload?: (file: File) => Promise<{ url?: string; error?: string }>;
  mentionItems?: MentionItem[];
  onMentionsChange?: (ids: string[]) => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<MentionItem[]>(mentionItems ?? []);
  useEffect(() => {
    itemsRef.current = mentionItems ?? [];
  }, [mentionItems]);
  const sugRef = useRef<Suggestion | null>(null);
  const [sug, setSugState] = useState<Suggestion | null>(null);
  const [html, setHtml] = useState(initialHtml);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastMentions = useRef<string>("");

  function setSug(next: Suggestion | null) {
    sugRef.current = next;
    setSugState(next);
  }

  // Popup position relative to the editor wrapper. Called from Tiptap's
  // suggestion callbacks (ProseMirror events), never during render.
  function positionFor(rect: DOMRect | null | undefined): { top: number; left: number } {
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!rect || !wrap) return { top: 40, left: 8 };
    return { top: rect.bottom - wrap.top + 4, left: Math.max(0, rect.left - wrap.left) };
  }

  function emit(editor: Editor) {
    const { html: next, mentionIds } = serialize(editor);
    setHtml(next);
    onChange?.(next);
    const key = mentionIds.join("|");
    if (key !== lastMentions.current) {
      lastMentions.current = key;
      onMentionsChange?.(mentionIds);
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    content: initialHtml,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      ...(mentionItems
        ? [
            // eslint-disable-next-line react-hooks/refs -- the callbacks below run from ProseMirror events, never during render
            Mention.configure({
              HTMLAttributes: { class: "mention" },
              deleteTriggerWithBackspace: true,
              suggestion: {
                char: "@",
                items: ({ query }) => filterItems(itemsRef.current, query),
                render: () => ({
                  onStart: (props: SuggestionProps<MentionItem>) =>
                    setSug({ items: props.items, index: 0, ...positionFor(props.clientRect?.()), command: props.command }),
                  onUpdate: (props: SuggestionProps<MentionItem>) =>
                    setSug({ items: props.items, index: 0, ...positionFor(props.clientRect?.()), command: props.command }),
                  onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                    const s = sugRef.current;
                    if (!s) return false;
                    const n = s.items.length;
                    if (event.key === "ArrowDown" && n > 0) {
                      setSug({ ...s, index: (s.index + 1) % n });
                      return true;
                    }
                    if (event.key === "ArrowUp" && n > 0) {
                      setSug({ ...s, index: (s.index - 1 + n) % n });
                      return true;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      const it = s.items[s.index];
                      if (it) s.command({ id: it.id, label: it.title });
                      return true;
                    }
                    if (event.key === "Escape") {
                      setSug(null);
                      return true;
                    }
                    return false;
                  },
                  onExit: () => setSug(null),
                }),
              },
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: {
        class: "tiptap min-h-40 px-3 py-2 text-sm focus:outline-none",
      },
    },
    onCreate: ({ editor }) => emit(editor),
    onUpdate: ({ editor }) => emit(editor),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            link: e.isActive("link"),
          }
        : null,
  });

  // Close the mention popup if the editor loses focus by click elsewhere.
  useEffect(() => {
    if (!sug) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSug(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [sug]);

  function addLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", prev ?? "");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImageUpload || !editor) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await onImageUpload(file);
      if (res.error || !res.url) {
        setUploadError(res.error ?? "Upload failed.");
        return;
      }
      editor.chain().focus().setImage({ src: res.url }).run();
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function insertMentionTrigger() {
    editor?.chain().focus().insertContent("@").run();
  }

  const tb = (on: boolean | undefined) =>
    cn("h-8 px-2", on ? "bg-muted text-foreground" : "text-muted-foreground");

  const popupStyle = sug ? { top: sug.top, left: sug.left } : undefined;

  return (
    <div ref={wrapRef} className={cn("relative grid gap-1.5", className)}>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="ghost" className={tb(active?.bold)} aria-label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold />
        </Button>
        <Button type="button" size="sm" variant="ghost" className={tb(active?.italic)} aria-label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic />
        </Button>
        <Button type="button" size="sm" variant="ghost" className={tb(active?.underline)} aria-label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon />
        </Button>
        <Button type="button" size="sm" variant="ghost" className={tb(active?.bulletList)} aria-label="Bulleted list" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List />
        </Button>
        <Button type="button" size="sm" variant="ghost" className={tb(active?.orderedList)} aria-label="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </Button>
        <Button type="button" size="sm" variant="ghost" className={tb(active?.link)} aria-label="Link" onClick={addLink}>
          <Link2 />
        </Button>
        {onImageUpload ? (
          <>
            <Button type="button" size="sm" variant="ghost" className={tb(false)} disabled={uploading} aria-label="Insert image" onClick={() => fileRef.current?.click()}>
              <ImageIcon />
              {uploading ? <span className="text-xs">Uploading…</span> : null}
            </Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={pickImage} />
          </>
        ) : null}
        {mentionItems ? (
          <Button type="button" size="sm" variant="ghost" className={tb(false)} aria-label="Mention music" onClick={insertMentionTrigger}>
            <Music />
            <span className="text-xs">@ music</span>
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border bg-card focus-within:ring-[3px] focus-within:ring-ring/40">
        {editor ? <EditorContent editor={editor} /> : <div className="min-h-40 px-3 py-2 text-sm text-muted-foreground">Loading editor…</div>}
      </div>

      {sug ? (
        <ul
          role="listbox"
          className="absolute z-20 w-72 rounded-md border bg-popover p-1 text-sm shadow-md"
          style={popupStyle}
        >
          {sug.items.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">No matching music</li>
          ) : (
            sug.items.map((it, i) => (
              <li key={it.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sug.index}
                  className={cn("w-full rounded-sm px-2 py-1.5 text-left", i === sug.index && "bg-accent")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => sug.command({ id: it.id, label: it.title })}
                >
                  <span className="block truncate font-medium">{it.title}</span>
                  {it.subtitle ? <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {uploadError ? <p role="alert" className="text-sm text-destructive">{uploadError}</p> : null}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
