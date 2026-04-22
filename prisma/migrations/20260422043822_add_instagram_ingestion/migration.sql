-- AlterTable
ALTER TABLE "CookLog"
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "videoAspectRatio" DOUBLE PRECISION,
  ADD COLUMN "instagramPostId" TEXT;

-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL,
    "mediaBlobUrl" TEXT,
    "videoBlobUrl" TEXT,
    "thumbnailBlobUrl" TEXT,
    "aspectRatio" DOUBLE PRECISION,
    "savedRecipeId" TEXT,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_userId_key" ON "InstagramConnection"("userId");

-- CreateIndex
CREATE INDEX "InstagramConnection_userId_idx" ON "InstagramConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPost_postId_key" ON "InstagramPost"("postId");

-- CreateIndex
CREATE INDEX "InstagramPost_connectionId_postedAt_idx" ON "InstagramPost"("connectionId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CookLog_instagramPostId_key" ON "CookLog"("instagramPostId");

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_instagramPostId_fkey" FOREIGN KEY ("instagramPostId") REFERENCES "InstagramPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
