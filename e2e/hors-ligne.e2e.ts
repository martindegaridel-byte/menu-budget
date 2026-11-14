import { expect, test } from "@playwright/test";

/** Au magasin sans réseau : liste et mode magasin utilisables, recettes du menu disponibles, courses mises en attente. */
test("hors connexion", async ({ page, context }) => {
  await page.addInitScript(() => window.localStorage.setItem("mb:onboarded", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: /Générer mon menu/ }).click();
  await expect(page.getByRole("tab", { name: /Semaine/ })).toBeVisible({ timeout: 30_000 });
  const recipeId = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (JSON.parse(window.localStorage.getItem("mb:result")!) as { recipes: { recipeId: string }[] }).recipes.at(-1)!.recipeId;
  });
  await page.reload({ waitUntil: "networkidle" });
  // Le service worker prépare les recettes du menu en arrière-plan.
  await expect
    .poll(async () => page.evaluate(async (id) => (await caches.keys()).length > 0 && !!(await caches.match(`/recettes/${id}`, { ignoreSearch: true })), recipeId), { timeout: 20_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Hors connexion/).first()).toBeVisible();

  await test.step("liste et mode magasin", async () => {
    await page.getByRole("tab", { name: /Courses/ }).click();
    await page.getByRole("button", { name: /Mode magasin/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /Fermer|Quitter/ }).first().click();
  });

  await test.step("courses notées hors connexion, appliquées au retour du réseau", async () => {
    await page.getByRole("button", { name: /J'ai fait mes courses/ }).click();
    await page.getByRole("button", { name: /Confirmer la mise à jour/ }).click();
    await expect(page.getByText(/seront ajoutés au placard dès le retour du réseau/)).toBeVisible();
  });

  await test.step("recette du menu jamais ouverte, et page jamais visitée", async () => {
    await page.goto(`/recettes/${recipeId}`);
    await expect(page.getByRole("heading", { name: /Ingrédients pour/ })).toBeVisible();
    await page.goto("/magasins");
    await expect(page.getByRole("heading", { name: "Pas de connexion" })).toBeVisible();
  });

  await page.goto("/").catch(() => undefined);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("Achats ajoutés au placard")).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => window.localStorage.getItem("mb:pending-purchase"))).toBeNull();
});
