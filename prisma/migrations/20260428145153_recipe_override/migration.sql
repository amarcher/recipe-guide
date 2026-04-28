-- CreateTable
CREATE TABLE "RecipeOverride" (
    "id" TEXT NOT NULL,
    "parsedRecipeId" TEXT NOT NULL,
    "userId" TEXT,
    "familyId" TEXT,
    "cardJson" JSONB NOT NULL,
    "forkedFromUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "RecipeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeOverride_userId_idx" ON "RecipeOverride"("userId");

-- CreateIndex
CREATE INDEX "RecipeOverride_familyId_idx" ON "RecipeOverride"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeOverride_parsedRecipeId_userId_familyId_key" ON "RecipeOverride"("parsedRecipeId", "userId", "familyId");

-- AddForeignKey
ALTER TABLE "RecipeOverride" ADD CONSTRAINT "RecipeOverride_parsedRecipeId_fkey" FOREIGN KEY ("parsedRecipeId") REFERENCES "ParsedRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOverride" ADD CONSTRAINT "RecipeOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOverride" ADD CONSTRAINT "RecipeOverride_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOverride" ADD CONSTRAINT "RecipeOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
