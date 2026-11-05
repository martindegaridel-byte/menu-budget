-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "freezable" BOOLEAN;
ALTER TABLE "Recipe" ADD COLUMN "fridgeDays" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "portions" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "reheats" BOOLEAN;
