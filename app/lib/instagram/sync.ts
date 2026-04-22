import type { CookCard } from "@/app/types";
import { prisma } from "@/app/lib/prisma";
import { parseRecipeUrl } from "@/app/lib/parser";
import {
  fetchMediaPage,
  pickImageUrl,
  pickVideoUrl,
  type IgMedia,
} from "./client";
import { rehostImage, rehostVideo } from "./rehost";
import { extractRecipeUrl, reconstructFromInstagram } from "./reconstruct";

export type SyncOutcome = {
  connectionId: string;
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
  // True when we stopped early because the budget filled AND IG told us
  // there are more pages. The UI can prompt the user to click Sync again.
  hasMore: boolean;
  details: Array<{
    postId: string;
    status: "imported" | "skipped" | "error";
    message?: string;
  }>;
};

// One pass over a connection's media. Walks pages backward in time until it
// hits the new-import cap OR runs out of posts. Per-post errors are captured
// into InstagramPost.processingError so a bad caption doesn't halt the
// batch.
//
// `maxPosts` limits NEW imports, not total scanned: already-synced posts
// aren't counted against the cap. That way re-running sync progressively
// drains the backlog even if you've already imported the first page.
export async function syncConnection(
  connectionId: string,
  opts: { maxPosts?: number; force?: boolean } = {}
): Promise<SyncOutcome> {
  // Default cap sized to fit in the route's 300s maxDuration given ~20s per
  // post. If there's more history, the user re-clicks Sync now.
  const maxPosts = opts.maxPosts ?? 12;
  const maxPages = 80; // 80 × 25 = 2000 post ceiling — way past anyone's IG archive

  const connection = await prisma.instagramConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) throw new Error("connection not found");

  const outcome: SyncOutcome = {
    connectionId,
    scanned: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    hasMore: false,
    details: [],
  };

  const alreadySeen = new Set(
    (
      await prisma.instagramPost.findMany({
        where: { connectionId },
        select: { postId: true, processedAt: true },
      })
    )
      .filter((p) => p.processedAt != null)
      .map((p) => p.postId)
  );

  let cursor: string | undefined;
  let pages = 0;
  // Work budget: stop paginating once we've newly-imported (or errored on)
  // maxPosts fresh posts. Skipped-already-seen ones don't count.
  const budgetSpent = () => outcome.imported + outcome.errors >= maxPosts;

  outer: while (!budgetSpent() && pages < maxPages) {
    const page = await fetchMediaPage(connection.accessToken, {
      after: cursor,
      limit: 25,
    });
    pages++;

    for (const media of page.data) {
      if (budgetSpent()) break outer;
      outcome.scanned++;

      if (!opts.force && alreadySeen.has(media.id)) {
        outcome.skipped++;
        outcome.details.push({ postId: media.id, status: "skipped" });
        continue;
      }

      try {
        await processOne(connection.userId, connectionId, media);
        outcome.imported++;
        outcome.details.push({ postId: media.id, status: "imported" });
      } catch (e) {
        outcome.errors++;
        const msg = e instanceof Error ? e.message : "unknown error";
        outcome.details.push({
          postId: media.id,
          status: "error",
          message: msg,
        });
        // Persist error marker for later retry.
        await prisma.instagramPost
          .upsert({
            where: { postId: media.id },
            create: {
              connectionId,
              postId: media.id,
              permalink: media.permalink,
              postedAt: new Date(media.timestamp),
              caption: media.caption ?? null,
              mediaType: media.media_type,
              processingError: msg,
            },
            update: { processingError: msg },
          })
          .catch(() => {});
      }
    }

    const next = page.paging?.cursors?.after;
    if (!next) break;
    cursor = next;
    if (budgetSpent()) {
      outcome.hasMore = true;
      break;
    }
  }

  await prisma.instagramConnection.update({
    where: { id: connectionId },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError:
        outcome.errors > 0
          ? `${outcome.errors} post(s) failed on last sync`
          : null,
    },
  });

  return outcome;
}

async function processOne(
  userId: string,
  connectionId: string,
  media: IgMedia
): Promise<void> {
  const sourceImageUrl = pickImageUrl(media);
  const sourceVideoUrl = pickVideoUrl(media);
  if (!sourceImageUrl) {
    throw new Error("no usable image URL on post");
  }

  // Rehost media first so we have stable URLs even if model call fails.
  const rehosted = await rehostImage(media.id, sourceImageUrl);
  let videoUrl: string | null = null;
  if (sourceVideoUrl) {
    try {
      const v = await rehostVideo(media.id, sourceVideoUrl);
      videoUrl = v.url;
    } catch (e) {
      // Video rehost is best-effort; the still image is enough to render a
      // tile. Log and carry on.
      console.warn("[ig-sync] video rehost failed for", media.id, e);
    }
  }

  // Build or fetch the CookCard.
  const linkedRecipeUrl = extractRecipeUrl(media.caption);
  let card: CookCard;
  if (linkedRecipeUrl) {
    try {
      const result = await parseRecipeUrl(linkedRecipeUrl);
      card = result.card;
    } catch (e) {
      // Falling back to reconstruction keeps the post importable even if
      // the linked page is down, paywalled, or dynamic.
      console.warn(
        "[ig-sync] linked recipe parse failed, falling back to reconstruction:",
        e
      );
      card = await reconstructFromInstagram({
        postId: media.id,
        permalink: media.permalink,
        caption: media.caption ?? null,
        imageUrl: rehosted.url,
      });
    }
  } else {
    card = await reconstructFromInstagram({
      postId: media.id,
      permalink: media.permalink,
      caption: media.caption ?? null,
      imageUrl: rehosted.url,
    });
  }

  // ParsedRecipe keyed on card.source_url (either the linked recipe URL or
  // the IG permalink for reconstructed ones). Upsert so a re-run is safe.
  const parsed = await prisma.parsedRecipe.upsert({
    where: { sourceUrl: card.source_url },
    create: {
      sourceUrl: card.source_url,
      title: card.title,
      cardJson: card as unknown as object,
      modelUsed:
        card.provenance === "instagram-reconstructed"
          ? "claude-opus-4-7/ig-reconstruct"
          : "claude-opus-4-7",
    },
    update: {
      title: card.title,
      cardJson: card as unknown as object,
    },
  });

  // SavedRecipe — personal library scope. Family scoping is phase-3.
  // Hand-rolled dedupe because Postgres treats NULLs as distinct in unique
  // constraints (same pattern as /api/recipes POST).
  const existingSaved = await prisma.savedRecipe.findFirst({
    where: { userId, parsedRecipeId: parsed.id, familyId: null },
  });
  const saved =
    existingSaved ??
    (await prisma.savedRecipe.create({
      data: { userId, parsedRecipeId: parsed.id, familyId: null },
    }));

  // InstagramPost + CookLog in one transaction so they stay in sync.
  await prisma.$transaction(async (tx) => {
    const igPost = await tx.instagramPost.upsert({
      where: { postId: media.id },
      create: {
        connectionId,
        postId: media.id,
        permalink: media.permalink,
        postedAt: new Date(media.timestamp),
        caption: media.caption ?? null,
        mediaType: media.media_type,
        mediaBlobUrl: rehosted.url,
        videoBlobUrl: videoUrl,
        thumbnailBlobUrl: rehosted.url,
        aspectRatio: rehosted.aspectRatio,
        savedRecipeId: saved.id,
        processedAt: new Date(),
        processingError: null,
      },
      update: {
        permalink: media.permalink,
        postedAt: new Date(media.timestamp),
        caption: media.caption ?? null,
        mediaType: media.media_type,
        mediaBlobUrl: rehosted.url,
        videoBlobUrl: videoUrl,
        thumbnailBlobUrl: rehosted.url,
        aspectRatio: rehosted.aspectRatio,
        savedRecipeId: saved.id,
        processedAt: new Date(),
        processingError: null,
      },
    });

    // One CookLog per IG post, dated to the post date. Idempotent on
    // CookLog.instagramPostId (unique).
    const existingLog = await tx.cookLog.findUnique({
      where: { instagramPostId: igPost.id },
    });
    if (existingLog) {
      await tx.cookLog.update({
        where: { id: existingLog.id },
        data: {
          cookedAt: new Date(media.timestamp),
          photoUrl: rehosted.url,
          photoUploadedAt: new Date(),
          videoUrl,
          videoAspectRatio: rehosted.aspectRatio,
        },
      });
    } else {
      await tx.cookLog.create({
        data: {
          savedRecipeId: saved.id,
          userId,
          cookedAt: new Date(media.timestamp),
          photoUrl: rehosted.url,
          photoUploadedAt: new Date(),
          videoUrl,
          videoAspectRatio: rehosted.aspectRatio,
          instagramPostId: igPost.id,
        },
      });
      // Bump cookCount + lastCookedAt to reflect the new log. Only bump on
      // first-time import, never on re-runs.
      await tx.savedRecipe.update({
        where: { id: saved.id },
        data: {
          cookCount: { increment: 1 },
          lastCookedAt: new Date(media.timestamp),
        },
      });
    }
  });
}
