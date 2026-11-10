import type { SupabaseClient } from "@supabase/supabase-js";
import { api, avatarUrl } from "@/lib/erudent";

/**
 * Profile pictures, in the browser. The file is center-cropped to a square, resized to 256×256
 * and re-encoded as WebP before it leaves the device, so what's stored is small and has no
 * camera metadata. Errors are thrown as codes friendlyError() knows (avatar_*).
 */

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const SIZE = 256;
/** The source file. What's uploaded is far smaller (the bucket allows 2 MB). */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

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
 * Upload a new picture to avatars/<uid>/avatar-<timestamp>.webp, point the profile at it,
 * then delete the previous file. Returns the new path and its public URL.
 */
export async function uploadAvatar(sb: SupabaseClient, uid: string, file: File, previous: string | null) {
  const blob = await toSquare(file);
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
  if (previous && previous !== path) await bucket.remove([previous]).catch(() => {});
  return { path, url: avatarUrl(sb, path)! };
}

/** Back to the initial-letter avatar. The old file is deleted. */
export async function removeAvatar(sb: SupabaseClient, previous: string | null) {
  await api.setAvatar(sb, null);
  if (previous) await sb.storage.from("avatars").remove([previous]).catch(() => {});
}
