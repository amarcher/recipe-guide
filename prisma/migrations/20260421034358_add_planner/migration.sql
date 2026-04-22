-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'INTAKE_COMPLETE', 'SKELETON_READY', 'CANDIDATES_READY', 'COMMITTED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MealSlotType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "Eater" AS ENUM ('ADULTS', 'KIDS');

-- CreateEnum
CREATE TYPE "PlannedMealStatus" AS ENUM ('QUEUED', 'COOKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "KidFitTag" AS ENUM ('RELIABLE', 'STRETCH', 'NEW');

-- CreateEnum
CREATE TYPE "IntakeRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "syncExecution" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "createdById" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "intake" JSONB,
    "skeleton" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCandidate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slot" "MealSlotType" NOT NULL,
    "eaters" "Eater"[],
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "heroIngredientSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approxCookMinutes" INTEGER NOT NULL,
    "kidFitTag" "KidFitTag" NOT NULL DEFAULT 'RELIABLE',
    "composedCardDraft" JSONB NOT NULL,
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "filteredOutReason" TEXT,
    "scoreBreakdownJson" JSONB,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rankedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "chosenCandidateId" TEXT NOT NULL,
    "slot" "MealSlotType" NOT NULL,
    "eaters" "Eater"[],
    "status" "PlannedMealStatus" NOT NULL DEFAULT 'QUEUED',
    "targetDay" INTEGER,
    "cookedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slug" TEXT,
    "display" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" TEXT,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "purchasedAt" TIMESTAMP(3),
    "purchasedById" TEXT,

    CONSTRAINT "GroceryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeMessage" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "role" "IntakeRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyPlan_familyId_idx" ON "WeeklyPlan"("familyId");

-- CreateIndex
CREATE INDEX "WeeklyPlan_createdById_idx" ON "WeeklyPlan"("createdById");

-- CreateIndex
CREATE INDEX "WeeklyPlan_status_idx" ON "WeeklyPlan"("status");

-- CreateIndex
CREATE INDEX "MealCandidate_planId_slot_idx" ON "MealCandidate"("planId", "slot");

-- CreateIndex
CREATE INDEX "MealCandidate_planId_rank_idx" ON "MealCandidate"("planId", "rank");

-- CreateIndex
CREATE INDEX "PlannedMeal_planId_status_idx" ON "PlannedMeal"("planId", "status");

-- CreateIndex
CREATE INDEX "PlannedMeal_chosenCandidateId_idx" ON "PlannedMeal"("chosenCandidateId");

-- CreateIndex
CREATE INDEX "GroceryItem_planId_purchased_idx" ON "GroceryItem"("planId", "purchased");

-- CreateIndex
CREATE INDEX "GroceryItem_planId_slug_idx" ON "GroceryItem"("planId", "slug");

-- CreateIndex
CREATE INDEX "IntakeMessage_planId_createdAt_idx" ON "IntakeMessage"("planId", "createdAt");

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCandidate" ADD CONSTRAINT "MealCandidate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_chosenCandidateId_fkey" FOREIGN KEY ("chosenCandidateId") REFERENCES "MealCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeMessage" ADD CONSTRAINT "IntakeMessage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
