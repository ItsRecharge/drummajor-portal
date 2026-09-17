// Shared HTML shell for every outgoing email. Pure (no Prisma) so templates
// built on it can be unit-tested; src/lib/email.ts re-exports the same helpers.

// Brand for outgoing mail: school crimson + charcoal, warm paper background.
export const BRAND = {
  red: "#b3122b",
  ink: "#1f1d1c",
  muted: "#6b6560",
  rule: "#e8e3dc",
  paper: "#faf8f5",
};

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Shared shell: red masthead with the band name, white card, quiet footer.
// Everything is inline-styled because email clients ignore stylesheets.
export function shell(inner: string, bandName?: string): string {
  const title = escapeText(bandName ?? "Drum Major Portal");
  return `<div style="background:${BRAND.paper};padding:24px 12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.ink}">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:${BRAND.red};color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:14px">${title}</div>
    <div style="background:#fff;border:1px solid ${BRAND.rule};border-top:none;border-radius:0 0 8px 8px;padding:24px;font-size:15px;line-height:1.55">
      ${inner}
    </div>
    <p style="font-size:12px;color:${BRAND.muted};margin:14px 4px 0">Sent via the Drum Major Portal</p>
  </div>
</div>`;
}

export function layout(heading: string, body: string, bandName?: string): string {
  return shell(`<h2 style="margin:0 0 14px;font-size:20px;color:${BRAND.ink}">${heading}</h2>${body}`, bandName);
}

export function button(href: string, label: string): string {
  return `<p style="margin:18px 0 6px"><a href="${href}" style="display:inline-block;background:${BRAND.red};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${label}</a></p>
    <p style="font-size:12px;color:${BRAND.muted};margin:0">Or paste this link: ${href}</p>`;
}

export function meta(rows: [string, string | null | undefined][]): string {
  const cells = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:${BRAND.muted};font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;font-size:14px">${escapeText(String(v))}</td></tr>`,
    )
    .join("");
  return cells ? `<table role="presentation" style="border-collapse:collapse;margin:8px 0 12px">${cells}</table>` : "";
}

// A quiet paragraph for policy / fine print.
export function note(html: string): string {
  return `<p style="margin:16px 0 0;padding:12px 14px;background:${BRAND.paper};border-left:3px solid ${BRAND.red};border-radius:0 6px 6px 0;font-size:14px">${html}</p>`;
}
