-- CreateEnum
CREATE TYPE "MealVerdict" AS ENUM ('ATE', 'PICKED', 'REFUSED');

-- CreateEnum
CREATE TYPE "EaterRole" AS ENUM ('ADULT', 'KID');

-- AlterEnum
ALTER TYPE "PlannedMealStatus" ADD VALUE 'COOKED_FROM_LEFTOVERS';

-- AlterTable
ALTER TABLE "WeeklyPlan" ADD COLUMN     "dietaryNote" TEXT,
ADD COLUMN     "hostNote" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedSlug" TEXT;

-- AlterTable
ALTER TABLE "PlannedMeal" ADD COLUMN     "cookLogId" TEXT;

-- CreateTable
CREATE TABLE "FamilyEvent" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "planId" TEXT,
    "savedRecipeId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiseCheckShared" (
    "id" TEXT NOT NULL,
    "savedRecipeId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "MiseCheckShared_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealOutcome" (
    "plannedMealId" TEXT NOT NULL,
    "profileId" TEXT,
    "eaterRole" "EaterRole" NOT NULL,
    "verdict" "MealVerdict" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,

    CONSTRAINT "MealOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlanMenuItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "plannedMealId" TEXT,
    "courseLabel" TEXT,
    "displayBlurb" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "snapshotCardJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyPlanMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeShareToken" (
    "id" TEXT NOT NULL,
    "savedRecipeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListShare" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sharedWithEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GroceryListShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyEvent_familyId_createdAt_idx" ON "FamilyEvent"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyEvent_familyId_kind_idx" ON "FamilyEvent"("familyId", "kind");

-- CreateIndex
CREATE INDEX "MiseCheckShared_savedRecipeId_familyId_idx" ON "MiseCheckShared"("savedRecipeId", "familyId");

-- CreateIndex
CREATE INDEX "MiseCheckShared_familyId_checkedAt_idx" ON "MiseCheckShared"("familyId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiseCheckShared_savedRecipeId_familyId_entryKey_key" ON "MiseCheckShared"("savedRecipeId", "familyId", "entryKey");

-- CreateIndex
CREATE INDEX "MealOutcome_plannedMealId_idx" ON "MealOutcome"("plannedMealId");

-- CreateIndex
CREATE INDEX "MealOutcome_profileId_createdAt_idx" ON "MealOutcome"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyPlanMenuItem_planId_position_idx" ON "WeeklyPlanMenuItem"("planId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeShareToken_token_key" ON "RecipeShareToken"("token");

-- CreateIndex
CREATE INDEX "RecipeShareToken_savedRecipeId_idx" ON "RecipeShareToken"("savedRecipeId");

-- CreateIndex
CREATE INDEX "RecipeShareToken_createdById_idx" ON "RecipeShareToken"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryListShare_token_key" ON "GroceryListShare"("token");

-- CreateIndex
CREATE INDEX "GroceryListShare_planId_idx" ON "GroceryListShare"("planId");

-- CreateIndex
CREATE INDEX "GroceryListShare_createdById_idx" ON "GroceryListShare"("createdById");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_publishedSlug_key" ON "WeeklyPlan"("publishedSlug");

-- AddForeignKey
ALTER TABLE "FamilyEvent" ADD CONSTRAINT "FamilyEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyEvent" ADD CONSTRAINT "FamilyEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiseCheckShared" ADD CONSTRAINT "MiseCheckShared_savedRecipeId_fkey" FOREIGN KEY ("savedRecipeId") REFERENCES "SavedRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiseCheckShared" ADD CONSTRAINT "MiseCheckShared_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiseCheckShared" ADD CONSTRAINT "MiseCheckShared_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealOutcome" ADD CONSTRAINT "MealOutcome_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealOutcome" ADD CONSTRAINT "MealOutcome_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanMenuItem" ADD CONSTRAINT "WeeklyPlanMenuItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanMenuItem" ADD CONSTRAINT "WeeklyPlanMenuItem_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeShareToken" ADD CONSTRAINT "RecipeShareToken_savedRecipeId_fkey" FOREIGN KEY ("savedRecipeId") REFERENCES "SavedRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeShareToken" ADD CONSTRAINT "RecipeShareToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListShare" ADD CONSTRAINT "GroceryListShare_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListShare" ADD CONSTRAINT "GroceryListShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
