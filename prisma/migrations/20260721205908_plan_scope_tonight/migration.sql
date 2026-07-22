-- CreateEnum
CREATE TYPE "PlanScope" AS ENUM ('WEEK', 'TONIGHT');

-- AlterTable
ALTER TABLE "WeeklyPlan" ADD COLUMN     "scope" "PlanScope" NOT NULL DEFAULT 'WEEK';
