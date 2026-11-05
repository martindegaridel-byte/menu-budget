import { PrismaClient } from "@prisma/client";
import { loadSeedData } from "../src/lib/data/seed";

const prisma = new PrismaClient();

async function main() {
  const data = loadSeedData();

  await prisma.$transaction(async (tx) => {
    // Les estimations de l'enseigne sont rechargées ; les prix utilisateur (userId non nul) sont conservés.
    await tx.package.deleteMany({ where: { userId: null } });
    await tx.recipeIngredient.deleteMany({});

    for (const i of data.ingredients) {
      const row = {
        name: i.name,
        aisle: i.aisle,
        unit: i.unit,
        gramsPerPiece: i.gramsPerPiece ?? null,
        animal: i.animal,
        allergensJson: JSON.stringify(i.allergens),
        staple: i.staple,
        tagsJson: JSON.stringify(i.tags),
        nutritionJson: i.nutrition ? JSON.stringify(i.nutrition) : null,
      };
      await tx.ingredient.upsert({ where: { id: i.id }, create: { id: i.id, ...row }, update: row });
    }

    await tx.package.createMany({
      data: data.packages.map((p) => ({
        id: p.id,
        ingredientId: p.ingredientId,
        chain: data.chain,
        label: p.label,
        brand: p.brand ?? null,
        quantity: p.quantity,
        priceCents: p.priceCents,
        source: p.source,
        asOf: p.asOf,
      })),
    });

    for (const r of data.recipes) {
      const row = {
        name: r.name,
        description: r.description,
        cuisine: r.cuisine,
        baseServings: r.baseServings,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        difficulty: r.difficulty,
        equipmentJson: JSON.stringify(r.equipment),
        tagsJson: JSON.stringify(r.tags),
        stepsJson: JSON.stringify(r.steps),
        source: r.source,
        portions: r.portions ?? null,
        fridgeDays: r.fridgeDays ?? null,
        freezable: r.freezable ?? null,
        reheats: r.reheats ?? null,
      };
      await tx.recipe.upsert({ where: { id: r.id }, create: { id: r.id, ...row }, update: row });
      await tx.recipeIngredient.createMany({
        data: r.ingredients.map((l, position) => ({
          recipeId: r.id,
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          optional: l.optional,
          position,
        })),
      });
    }

    for (const s of data.stores) {
      const row = { name: s.name, chain: s.chain, format: s.format, city: s.city ?? null, priceIndex: s.priceIndex };
      await tx.store.upsert({ where: { id: s.id }, create: { id: s.id, ...row }, update: row });
    }
  }, { timeout: 60_000 });

  console.log(
    `Seed OK : ${data.ingredients.length} ingrédients, ${data.packages.length} conditionnements, ${data.recipes.length} recettes, ${data.stores.length} magasin(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
