-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aisle" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "gramsPerPiece" REAL,
    "animal" TEXT,
    "allergensJson" TEXT NOT NULL DEFAULT '[]',
    "staple" BOOLEAN NOT NULL DEFAULT false,
    "tagsJson" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_Ingredient" ("aisle", "allergensJson", "animal", "gramsPerPiece", "id", "name", "staple", "unit") SELECT "aisle", "allergensJson", "animal", "gramsPerPiece", "id", "name", "staple", "unit" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
