import type { SupabaseClient } from "@supabase/supabase-js";
import { api, avatarUrl } from "@/lib/erudent";

/**
 * Profile pictures, in the browser. The file is center-cropped to a square, resized to 256×256
 * and re-encoded as WebP before it leaves the device, so what's stored is small and has no
 * camera metadata. Errors are thrown as codes friendlyError() knows (avatar_*).
 *
 * Each player's folder (avatars/<uid>/) should hold at most one file: the current picture.
 * After every change the folder is swept, so files left by other tabs, failed uploads or
 * interrupted replaces don't pile up.
 */

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const SIZE = 256;
/** The source file. What's uploaded is far smaller (the bucket allows 2 MB). */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** Storage lists at most this many names per call. */
const PAGE = 100;

async function toSquare(file: File): Promise<Blob> {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) throw new Error("avatar_wrong_type");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("avatar_too_big");

  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    throw new Error("avatar_unreadable");
  }
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("avatar_unreadable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  img.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("avatar_unreadable");
  // Browsers that can't encode WebP hand back a PNG; that's still an allowed type.
  return blob;
}

/**
 * Delete every file in avatars/<uid>/ except the profile's current picture.
 * "Current" is read from the server at sweep time, not taken from this tab: if another tab
 * set its picture a moment ago, that file stays. Best effort: a failed sweep never fails the
 * change it follows, and the next sweep picks up whatever was left.
 * Returns the paths it asked Storage to remove.
 */
export async function sweepAvatarFolder(sb: SupabaseClient, uid: string): Promise<string[]> {
  try {
    const keep = (await api.myPlayer(sb))?.avatar_path ?? null;
    const bucket = sb.storage.from("avatars");
    const stale: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(uid, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) break;
      for (const f of data) {
        const path = `${uid}/${f.name}`;
        // list() also returns folder placeholders (no id); only files go.
        if (f.id && path !== keep) stale.push(path);
      }
      if (data.length < PAGE) break;
    }
    for (let i = 0; i < stale.length; i += PAGE) await bucket.remove(stale.slice(i, i + PAGE));
    return stale;
  } catch {
    return [];
  }
}

/** Upload an already-prepared picture, point the profile at it, then sweep the folder. */
export async function storeAvatar(sb: SupabaseClient, uid: string, blob: Blob) {
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  const bucket = sb.storage.from("avatars");

  const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message || "avatar_upload_failed");

  try {
    await api.setAvatar(sb, path);
  } catch (e) {
    await bucket.remove([path]).catch(() => {});
    throw e;
  }
  await sweepAvatarFolder(sb, uid);
  return { path, url: avatarUrl(sb, path)! };
}

/** Crop, upload and set a new picture. Returns its path and public URL. */
export async function uploadAvatar(sb: SupabaseClient, uid: string, file: File) {
  return storeAvatar(sb, uid, await toSquare(file));
}

/** Back to the initial-letter avatar. The folder is swept empty (unless another tab just set one). */
export async function removeAvatar(sb: SupabaseClient, uid: string) {
  await api.setAvatar(sb, null);
  await sweepAvatarFolder(sb, uid);
}
