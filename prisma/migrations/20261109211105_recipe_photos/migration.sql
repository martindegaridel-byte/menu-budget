-- CreateTable
CREATE TABLE "RecipePhoto" (
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "recipeId"),
    CONSTRAINT "RecipePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
