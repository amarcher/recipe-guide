-- CreateEnum
CREATE TYPE "ProfileKind" AS ENUM ('ADULT', 'KID');

-- CreateEnum
CREATE TYPE "ProfilePreferenceKind" AS ENUM ('RELIABLE_HIT', 'HARD_NO', 'ASPIRATION', 'EXPERIMENTING');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProfileKind" NOT NULL DEFAULT 'KID',
    "ageBand" TEXT,
    "avatarColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfilePreference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "ProfilePreferenceKind" NOT NULL,
    "slug" TEXT,
    "display" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'intake',
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProfilePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_familyId_idx" ON "Profile"("familyId");

-- CreateIndex
CREATE INDEX "Profile_familyId_kind_idx" ON "Profile"("familyId", "kind");

-- CreateIndex
CREATE INDEX "ProfilePreference_profileId_kind_idx" ON "ProfilePreference"("profileId", "kind");

-- CreateIndex
CREATE INDEX "ProfilePreference_profileId_slug_idx" ON "ProfilePreference"("profileId", "slug");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePreference" ADD CONSTRAINT "ProfilePreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
