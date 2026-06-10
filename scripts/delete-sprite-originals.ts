/**
 * Delete every blob under `sprites/originals/` from Vercel Blob — but ONLY
 * after verifying that each one has a matching local twin under
 * `.local/sprites-originals/`. Refuses to delete if anything is missing or
 * the byte counts don't agree.
 *
 * Dry-run by default. Pass --execute to actually delete.
 *
 * Run:
 *   npm run sprites:delete-originals            # dry-run, prints plan
 *   npm run sprites:delete-originals --execute  # actually deletes
 */
import { list, del } from "@vercel/blob";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const PREFIX = "sprites/originals/";
const LOCAL_DIR = join(process.cwd(), ".local", "sprites-originals");
const BATCH_SIZE = 50;
const EXECUTE = process.argv.includes("--execute");

type RemoteBlob = {
  pathname: string;
  url: string;
  size: number;
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
      out.push({ pathname: b.pathname, url: b.url, size: b.size });
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function localSize(leaf: string): Promise<number | null> {
  try {
    const s = await stat(join(LOCAL_DIR, leaf));
    return s.size;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set (load via --env-file=.env.local)");
    process.exit(1);
  }

  console.log(`Listing remote blobs under ${PREFIX}…`);
  const blobs = await listAll();
  const totalBytes = blobs.reduce((a, b) => a + b.size, 0);
  console.log(`Found ${blobs.length} blobs, ${fmtBytes(totalBytes)} total\n`);

  // Pre-flight: every remote blob must have a matching local file.
  console.log(`Verifying local mirror at ${LOCAL_DIR}…`);
  const missing: string[] = [];
  const sizeMismatch: Array<{ pathname: string; remote: number; local: number }> = [];
  for (const b of blobs) {
    const leaf = b.pathname.slice(PREFIX.length);
    const localBytes = await localSize(leaf);
    if (localBytes === null) {
      missing.push(b.pathname);
    } else if (localBytes !== b.size) {
      sizeMismatch.push({ pathname: b.pathname, remote: b.size, local: localBytes });
    }
  }

  if (missing.length > 0 || sizeMismatch.length > 0) {
    console.error(`\nABORT: local mirror is incomplete.`);
    if (missing.length > 0) {
      console.error(`  Missing locally (${missing.length}):`);
      for (const p of missing.slice(0, 20)) console.error(`    ${p}`);
      if (missing.length > 20) console.error(`    … and ${missing.length - 20} more`);
    }
    if (sizeMismatch.length > 0) {
      console.error(`  Size mismatch (${sizeMismatch.length}):`);
      for (const m of sizeMismatch.slice(0, 20)) {
        console.error(`    ${m.pathname}  local=${m.local}  remote=${m.remote}`);
      }
    }
    console.error(`\nRun 'npm run sprites:download-originals' first.`);
    process.exit(1);
  }
  console.log(`OK — all ${blobs.length} blobs have matching local twins.\n`);

  if (!EXECUTE) {
    console.log("DRY RUN — would delete the following (pass --execute to actually delete):");
    for (const b of blobs.slice(0, 10)) {
      console.log(`  DEL ${b.pathname.padEnd(50)} ${fmtBytes(b.size).padStart(10)}`);
    }
    if (blobs.length > 10) console.log(`  … and ${blobs.length - 10} more`);
    console.log(`\nTotal to free: ${fmtBytes(totalBytes)} across ${blobs.length} blobs`);
    console.log("Re-run with --execute to perform the deletion.");
    return;
  }

  console.log(`Deleting ${blobs.length} blobs in batches of ${BATCH_SIZE}…\n`);
  let deleted = 0;
  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE);
    await del(batch.map((b) => b.url));
    deleted += batch.length;
    process.stdout.write(`  deleted ${deleted}/${blobs.length}\n`);
  }

  // Confirm it's gone.
  const remaining = await listAll();
  console.log(`\nDone. ${deleted} blobs deleted, ${fmtBytes(totalBytes)} freed.`);
  if (remaining.length > 0) {
    console.error(`WARNING: ${remaining.length} blobs still remain under ${PREFIX} — possibly written during the run.`);
  } else {
    console.log(`Verified: 0 blobs remain under ${PREFIX}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
