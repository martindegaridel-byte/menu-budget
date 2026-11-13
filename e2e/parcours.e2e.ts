import { expect, test } from "@playwright/test";

/** Parcours principal sur téléphone : menu dans le budget, semaine, courses, remplacement, fiche recette. */
test("parcours principal", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mb:onboarded", "1"));
  await page.goto("/");

  await test.step("génère un menu qui respecte le budget", async () => {
    await page.getByRole("button", { name: /Générer mon menu/ }).click();
    await expect(page.getByRole("tab", { name: /Semaine/ })).toBeVisible({ timeout: 30_000 });
    const result = await page.evaluate(() => JSON.parse(window.localStorage.getItem("mb:result") ?? "null") as { totalCents: number; budgetCents: number; recipes: unknown[] } | null);
    expect(result).not.toBeNull();
    expect(result!.recipes.length).toBeGreaterThan(0);
    expect(result!.totalCents).toBeLessThanOrEqual(result!.budgetCents);
  });

  const meals = await page.evaluate(() => (JSON.parse(window.localStorage.getItem("mb:result")!) as { recipes: unknown[] }).recipes.length);

  await test.step("remplace un ingrédient en voyant les prix", async () => {
    await page.getByRole("button", { name: /Remplacer un ingrédient dans/ }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("ul li button").first().click();
    await expect(sheet.getByText(/€\/(kg|L|pièce)/).first()).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole("button", { name: /Fermer/ }).click();
  });

  await test.step("planning de la semaine : un soir par plat", async () => {
    await page.getByRole("tab", { name: /Semaine/ }).click();
    await expect(page.getByRole("list", { name: "Planning des dîners" }).getByRole("listitem")).toHaveCount(meals);
  });

  await test.step("courses : saisie du prix payé disponible", async () => {
    await page.getByRole("tab", { name: /Courses/ }).click();
    await page.getByRole("button", { name: /Saisir le prix payé pour/ }).first().click();
    await expect(page.getByLabel(/Prix payé pour 1/)).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
  });

  await test.step("fiche recette avec nutrition sourcée", async () => {
    await page.getByRole("tab", { name: /Menu/ }).click();
    await page.locator('main a[href^="/recettes/"]').first().click();
    await expect(page.getByRole("heading", { name: /Ingrédients pour/ })).toBeVisible();
    await expect(page.getByText(/Ciqual/)).toBeVisible();
  });
});
