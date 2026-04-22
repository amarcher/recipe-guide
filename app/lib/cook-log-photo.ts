import { put } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/app/lib/prisma";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PREFIX = "image/";
const TARGET_MAX_DIMENSION = 1600;
const OUTPUT_QUALITY = 82;

export async function uploadCookLogPhoto(
  cookLogId: string,
  file: File
): Promise<string> {
  if (!file.type || !file.type.startsWith(ALLOWED_PREFIX)) {
    throw new Error("file must be an image");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("image too large (>10MB)");
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const processed = await sharp(raw)
    .rotate()
    .resize({
      width: TARGET_MAX_DIMENSION,
      height: TARGET_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })
    .toBuffer();

  const key = `cooklogs/${cookLogId}.jpg`;
  const blob = await put(key, processed, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  await prisma.cookLog.update({
    where: { id: cookLogId },
    data: { photoUrl: blob.url, photoUploadedAt: new Date() },
  });

  return blob.url;
}
