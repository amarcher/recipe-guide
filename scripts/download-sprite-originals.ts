/**
 * Download every blob under `sprites/originals/` to a local gitignored folder
 * so we have an offline copy before deleting them from Vercel Blob.
 *
 * Idempotent: re-running skips files whose local size already matches the
 * remote size. Pass --force to redownload everything.
 *
 * Run: npm run sprites:download-originals
 *      (or: node --env-file=.env.local --import tsx scripts/download-sprite-originals.ts)
 *
 * Verifies total local bytes match total remote bytes before exiting 0.
 * If it exits non-zero, do NOT run the deletion step.
 */
import { list } from "@vercel/blob";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PREFIX = "sprites/originals/";
const TARGET_DIR = join(process.cwd(), ".local", "sprites-originals");
const CONCURRENCY = 8;
const FORCE = process.argv.includes("--force");

type RemoteBlob = {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: Date;
};

function fmtBytes(b: number): string {
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

async function listAll(): Promise<RemoteBlob[]> {
  const out: RemoteBlob[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const b of r.blobs) {
      out.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: b.uploadedAt });
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function localPathFor(remote: RemoteBlob): string {
  const leaf = remote.pathname.slice(PREFIX.length);
  return join(TARGET_DIR, leaf);
}

async function localSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return null;
  }
}

async function downloadOne(b: RemoteBlob): Promise<{ status: "downloaded" | "skipped" | "size-mismatch" | "failed"; bytes: number; reason?: string }> {
  const dest = localPathFor(b);
  if (!FORCE) {
    const existing = await localSize(dest);
    if (existing === b.size) return { status: "skipped", bytes: b.size };
  }
  const res = await fetch(b.url);
  if (!res.ok) return { status: "failed", bytes: 0, reason: `HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== b.size) {
    return { status: "size-mismatch", bytes: buf.length, reason: `got ${buf.length}, expected ${b.size}` };
  }
  await writeFile(dest, buf);
  return { status: "downloaded", bytes: b.size };
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set (load .env.local with --env-file=.env.local)");
    process.exit(1);
  }
  await mkdir(TARGET_DIR, { recursive: true });

  console.log(`Listing remote blobs under ${PREFIX}…`);
  const blobs = await listAll();
  const totalRemoteBytes = blobs.reduce((a, b) => a + b.size, 0);
  console.log(`Found ${blobs.length} blobs, ${fmtBytes(totalRemoteBytes)} total`);
  console.log(`Target: ${TARGET_DIR}`);
  console.log(`Concurrency: ${CONCURRENCY}${FORCE ? "  (--force: redownload all)" : ""}\n`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;

  const results = await runPool(blobs, CONCURRENCY, async (b) => {
    const r = await downloadOne(b);
    done++;
    if (r.status === "downloaded") downloaded++;
    else if (r.status === "skipped") skipped++;
    else failed++;
    const tag = r.status === "downloaded" ? "DL" : r.status === "skipped" ? "..": "!!";
    const msg = r.reason ? `  (${r.reason})` : "";
    process.stdout.write(
      `[${String(done).padStart(3)}/${blobs.length}] ${tag} ${b.pathname.slice(PREFIX.length).padEnd(40)} ${fmtBytes(b.size).padStart(10)}${msg}\n`,
    );
    return r;
  });

  // Verify totals
  let localTotal = 0;
  for (const b of blobs) {
    const sz = await localSize(localPathFor(b));
    localTotal += sz ?? 0;
  }

  console.log(`\nDownloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed}`);
  console.log(`Local total:  ${fmtBytes(localTotal)}`);
  console.log(`Remote total: ${fmtBytes(totalRemoteBytes)}`);

  const failures = results.filter((r) => r.status === "failed" || r.status === "size-mismatch");
  if (failures.length > 0 || localTotal !== totalRemoteBytes) {
    console.error("\nFAILED: local bytes do not match remote bytes — do NOT delete originals from Blob.");
    process.exit(1);
  }
  console.log("\nOK — every original is mirrored locally with matching byte count.");
  console.log("Safe to delete sprites/originals/ from Vercel Blob.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
