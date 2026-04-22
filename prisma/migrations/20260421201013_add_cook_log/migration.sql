-- CreateTable
CREATE TABLE "CookLog" (
    "id" TEXT NOT NULL,
    "savedRecipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT,
    "photoUploadedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CookLog_savedRecipeId_cookedAt_idx" ON "CookLog"("savedRecipeId", "cookedAt");

-- CreateIndex
CREATE INDEX "CookLog_userId_cookedAt_idx" ON "CookLog"("userId", "cookedAt");

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_savedRecipeId_fkey" FOREIGN KEY ("savedRecipeId") REFERENCES "SavedRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
