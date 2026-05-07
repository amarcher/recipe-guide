-- AlterTable
ALTER TABLE "SavedRecipe" ADD COLUMN     "pivotKept" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pivotMeta" JSONB,
ADD COLUMN     "pivotedFromSavedRecipeId" TEXT;

-- CreateIndex
CREATE INDEX "SavedRecipe_pivotedFromSavedRecipeId_idx" ON "SavedRecipe"("pivotedFromSavedRecipeId");
