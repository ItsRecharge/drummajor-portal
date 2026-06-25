// Minimal allowlist HTML sanitizer for announcement bodies. The body originates
// from our own lightweight editor (src/components/rich-text.tsx), but we sanitize
// server-side regardless so a crafted POST can't inject scripts into the emails or
// the in-app preview. MVP-grade: keeps a small set of formatting tags, drops every
// attribute except a safe href on <a>.

const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li", "a", "h3", "h4", "blockquote",
]);

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeHref(attrs: string): string | null {
  const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!m) return null;
  const val = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  if (/^(https?:|mailto:)/i.test(val)) return escapeAttr(val);
  return null;
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // Strip dangerous elements together with their content.
  let html = input.replace(
    /<(script|style|iframe|object|embed|link|meta|title)[\s\S]*?<\/\1>/gi,
    "",
  );
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|title)\b[^>]*>/gi, "");

  // Rewrite every remaining tag: drop disallowed tags (keep their text), strip all
  // attributes, and re-emit only a vetted href on links.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (slash === "/") return `</${name}>`;
    if (name === "a") {
      const href = safeHref(attrs);
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${name}>`;
  });

  return html.trim();
}
