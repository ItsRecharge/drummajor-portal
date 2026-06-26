import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto";

// Google Drive access for the music library. Credentials are the service-account
// JSON captured in the setup wizard, stored encrypted in AppSettings.driveConfigEnc.
// A bare service account has no usable My Drive quota, so real deployments use a
// Shared Drive or domain-wide delegation (an `impersonate` subject in the JSON);
// supportsAllDrives is set on every call to cover the Shared-Drive case.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  impersonate?: string; // optional domain-wide-delegation subject
};

const ROOT_FOLDER_NAME = "Band Library";

export async function isDriveConfigured(): Promise<boolean> {
  const s = await prisma.appSettings.findFirst({ select: { driveConfigEnc: true } });
  return !!s?.driveConfigEnc;
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

export async function createFolder(name: string, parentId?: string): Promise<string> {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id!;
}

// Lazily create + remember the root "Band Library" folder so the wizard doesn't
// have to. Returns the stored id when one already exists.
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

// Lazily create + remember a "Document Vault" folder under the Band Library root,
// kept separate from the per-piece music folders (Stage 7 document vault).
export async function ensureVaultFolder(): Promise<string> {
  const settings = await prisma.appSettings.findFirst({
    select: { id: true, vaultRootFolderId: true },
  });
  if (!settings) throw new Error("App settings missing");
  if (settings.vaultRootFolderId) return settings.vaultRootFolderId;
  const root = await ensureRootFolder();
  const folderId = await createFolder("Document Vault", root);
  await prisma.appSettings.update({
    where: { id: settings.id },
    data: { vaultRootFolderId: folderId },
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

export async function getFileBuffer(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const drive = await getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? "file",
  };
}

export async function getFileStream(
  fileId: string,
): Promise<{ stream: Readable; mimeType: string; name: string }> {
  const drive = await getDrive();
  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  return {
    stream: res.data as unknown as Readable,
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? "file",
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

export async function shareWithUser(fileId: string, email: string): Promise<void> {
  const drive = await getDrive();
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "user", emailAddress: email },
    sendNotificationEmail: false,
    supportsAllDrives: true,
  });
}

// Fetch a file/folder's shareable webViewLink (without changing permissions).
// Used to lazily backfill links for items migrated from the old Music/Vault tables.
export async function getWebViewLink(fileId: string): Promise<string> {
  const drive = await getDrive();
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

// List the immediate children of a Drive folder, for the "Refresh from Drive"
// reconcile. Pages through all results.
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
    for (const f of res.data.files ?? []) {
      const isFolder = f.mimeType === "application/vnd.google-apps.folder";
      out.push({
        driveId: f.id!,
        name: f.name ?? "Untitled",
        isFolder,
        mimeType: f.mimeType ?? "application/octet-stream",
        webViewLink: f.webViewLink ?? null,
        sizeBytes: f.size ? Number(f.size) : null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}
