import { put } from "@vercel/blob";
import sharp from "sharp";

// Instagram CDN URLs expire in hours. On ingest we download each one and
// push it to Vercel Blob so the tile keeps rendering forever. Keys are
// deterministic on the IG post ID so re-runs overwrite cleanly.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 82;

export type RehostedImage = {
  url: string;
  width: number;
  height: number;
  aspectRatio: number;
};

export async function rehostImage(
  postId: string,
  sourceUrl: string
): Promise<RehostedImage> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`image fetch ${res.status} for post ${postId}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large for post ${postId}: ${buf.byteLength}`);
  }
  const pipeline = sharp(buf)
    .rotate()
    .resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  const blob = await put(`instagram/${postId}.jpg`, data, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return {
    url: blob.url,
    width: info.width,
    height: info.height,
    aspectRatio: info.height > 0 ? info.width / info.height : 1,
  };
}

export async function rehostVideo(
  postId: string,
  sourceUrl: string
): Promise<{ url: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`video fetch ${res.status} for post ${postId}`);
  }
  // IG returns MP4 with an H.264+AAC profile that plays in every modern
  // browser. No transcoding needed here.
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > MAX_VIDEO_BYTES) {
    throw new Error(`video too large for post ${postId}: ${contentLength}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    throw new Error(`video too large for post ${postId}: ${buf.byteLength}`);
  }
  const blob = await put(`instagram/${postId}.mp4`, buf, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: blob.url };
}
