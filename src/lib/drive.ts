import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto";

// Google Drive access for the music library. Credentials are the service-account
// JSON captured in the setup wizard (or re-uploaded in Settings), stored
// encrypted in AppSettings.driveConfigEnc. The library root is the band's own
// "Band Music Database" folder, shared with the service account and set in
// Settings; when unset, a "Band Library" folder is created lazily instead.
// A bare service account has no usable My Drive quota, so real deployments use a
// Shared Drive or domain-wide delegation (an `impersonate` subject in the JSON);
// supportsAllDrives is set on every call to cover the Shared-Drive case.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  impersonate?: string; // optional domain-wide-delegation subject
};

const ROOT_FOLDER_NAME = "Band Library";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function isDriveConfigured(): Promise<boolean> {
  const s = await prisma.appSettings.findFirst({ select: { driveConfigEnc: true } });
  return !!s?.driveConfigEnc;
}

// Accepts a bare folder id or any Drive folder URL and returns the id.
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = /\/folders\/([A-Za-z0-9_-]+)/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

function driveClient(sa: ServiceAccount): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: sa.impersonate,
  });
  return google.drive({ version: "v3", auth });
}

async function getDrive(): Promise<drive_v3.Drive> {
  const s = await prisma.appSettings.findFirst({ select: { driveConfigEnc: true } });
  if (!s?.driveConfigEnc) throw new Error("Drive is not configured");
  return driveClient(decryptJson<ServiceAccount>(s.driveConfigEnc));
}

export async function getServiceAccountEmail(): Promise<string | null> {
  const s = await prisma.appSettings.findFirst({ select: { driveConfigEnc: true } });
  if (!s?.driveConfigEnc) return null;
  return decryptJson<ServiceAccount>(s.driveConfigEnc).client_email ?? null;
}

export async function createFolder(name: string, parentId?: string): Promise<string> {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id!;
}

// The configured root folder id, or null when none is set yet.
export async function getRootFolderId(): Promise<string | null> {
  const s = await prisma.appSettings.findFirst({ select: { driveRootFolderId: true } });
  return s?.driveRootFolderId ?? null;
}

// Returns the configured root, creating a "Band Library" folder only when none
// has been set (fresh installs before Settings → Google Drive is filled in).
export async function ensureRootFolder(): Promise<string> {
  const settings = await prisma.appSettings.findFirst({
    select: { id: true, driveRootFolderId: true },
  });
  if (!settings) throw new Error("App settings missing");
  if (settings.driveRootFolderId) return settings.driveRootFolderId;
  const folderId = await createFolder(ROOT_FOLDER_NAME);
  await prisma.appSettings.update({
    where: { id: settings.id },
    data: { driveRootFolderId: folderId },
  });
  return folderId;
}

export async function uploadFile(opts: {
  folderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ id: string; sizeBytes: number }> {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: { name: opts.filename, parents: [opts.folderId] },
    media: { mimeType: opts.mimeType, body: Readable.from(opts.buffer) },
    fields: "id,size",
    supportsAllDrives: true,
  });
  return { id: res.data.id!, sizeBytes: Number(res.data.size ?? opts.buffer.length) };
}

// Download a small text file (index.csv) as a string.
export async function getFileText(fileId: string): Promise<string> {
  const drive = await getDrive();
  const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "text" });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
}

// Replace an existing file's bytes in place (keeps its id and sharing).
export async function updateFileContent(fileId: string, mimeType: string, buffer: Buffer): Promise<void> {
  const drive = await getDrive();
  await drive.files.update({
    fileId,
    media: { mimeType, body: Readable.from(buffer) },
    supportsAllDrives: true,
  });
}

export async function renameDriveItem(fileId: string, name: string): Promise<void> {
  const drive = await getDrive();
  await drive.files.update({ fileId, requestBody: { name }, supportsAllDrives: true });
}

export async function moveDriveItem(fileId: string, fromParentId: string, toParentId: string): Promise<void> {
  if (fromParentId === toParentId) return;
  const drive = await getDrive();
  await drive.files.update({
    fileId,
    addParents: toParentId,
    removeParents: fromParentId,
    supportsAllDrives: true,
  });
}

export type DriveItemMeta = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  webViewLink: string | null;
};

export async function getDriveItem(fileId: string): Promise<DriveItemMeta> {
  const drive = await getDrive();
  const res = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink",
    supportsAllDrives: true,
  });
  return {
    id: res.data.id ?? fileId,
    name: res.data.name ?? "Untitled",
    mimeType: res.data.mimeType ?? "application/octet-stream",
    isFolder: res.data.mimeType === FOLDER_MIME,
    webViewLink: res.data.webViewLink ?? null,
  };
}

// Make a file viewable by anyone with the link; returns the shareable URL.
export async function shareAnyoneWithLink(fileId: string): Promise<string> {
  const drive = await getDrive();
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });
  const res = await drive.files.get({
    fileId,
    fields: "webViewLink",
    supportsAllDrives: true,
  });
  return res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
}

// Permanently delete a Drive file or folder (folders delete their contents too).
export async function deleteDriveItem(fileId: string): Promise<void> {
  const drive = await getDrive();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

export type DriveChild = {
  driveId: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  webViewLink: string | null;
  sizeBytes: number | null;
};

function toChild(f: drive_v3.Schema$File): DriveChild {
  const isFolder = f.mimeType === FOLDER_MIME;
  return {
    driveId: f.id!,
    name: f.name ?? "Untitled",
    isFolder,
    mimeType: f.mimeType ?? "application/octet-stream",
    webViewLink: f.webViewLink ?? null,
    sizeBytes: f.size ? Number(f.size) : null,
  };
}

// List the immediate children of a Drive folder. Pages through all results.
export async function listFolderChildren(folderId: string): Promise<DriveChild[]> {
  const drive = await getDrive();
  const out: DriveChild[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink, size)",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) out.push(toChild(f));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function findChildByName(parentId: string, name: string): Promise<DriveChild | null> {
  const drive = await getDrive();
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, size)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = res.data.files?.[0];
  return f ? toChild(f) : null;
}
