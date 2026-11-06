# Menu Budget — CLAUDE.md

Application web mobile-first : l'utilisateur donne un **budget**, un nombre de
**repas** (1 repas = 1 plat, en pratique des dîners) et ses contraintes ; l'app
compose des menus dont le coût **en caisse** respecte strictement le budget, puis
génère la liste de courses. Prix de référence : **Intermarché** (Super par défaut),
multi-magasins, avec import des prix réels **Open Prices**. Le **placard** de
l'utilisateur est déduit avant achat ; ses **exclusions permanentes** s'appliquent
à tous les menus.

## Règles impératives

1. **Ne jamais changer la logique métier, les routes (pages et `/api/*`) ni les
   données (schémas Zod, schéma Prisma, fichiers `data/`) sans me le demander
   explicitement.** Une refonte d'interface ne touche qu'à `src/components/`,
   `src/app/**/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` et aux
   helpers purement visuels.
2. **Design** : thème sombre et accent vert émeraude par défaut (personnalisables dans `/personnaliser` : accents et ambiances définis dans `globals.css`, contrastes AA vérifiés), icônes
   **lucide-react** (aucun emoji dans l'interface ni la navigation).
3. **Accessibilité** : mobile-first, cibles tactiles ≥ 44 px, contrastes AA minimum,
   labels sur tous les champs, focus visible, navigation au clavier,
   `prefers-reduced-motion` respecté.
4. **Après chaque tâche** : lancer `npm run lint` puis `npm run build` (et
   `npm run test` si du code `src/lib/` a été touché), corriger, puis résumer les
   changements (fait / non traité / risques).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript strict**
- **Tailwind CSS 4** (via `@tailwindcss/postcss`, styles dans `src/app/globals.css`)
- **Prisma 6** + **SQLite** (migration vers Postgres prévue), **Zod 3** aux frontières
- **Vitest** pour les tests (moteur, données, prix)
- **lucide-react** pour les icônes (à installer : `npm i lucide-react` — pas encore
  dans les dépendances, l'UI actuelle utilise encore des emojis à remplacer)
- `@anthropic-ai/sdk` pour la génération de recettes (optionnelle, désactivée par défaut)

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de dev (http://localhost:3000) |
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | tests Vitest |
| `npm run check` | typecheck + lint + test |
| `npm run db:migrate` | migration Prisma (dev) |
| `npm run db:seed` | charge ingrédients, prix, recettes, magasins |
| `npm run db:reset` | réinitialise la base + seed |

Première installation : `npm install`, `cp .env.example .env`, `npx prisma migrate dev`.

## Architecture

- `src/app/` — pages (`/` menu, `/batch` batch cooking, `/placard`, `/exclusions`, `/magasins`, `/historique`, `/personnaliser`,
  `/recettes/[id]`) en composants serveur qui chargent les données puis délèguent à
  des composants client ; routes API dans `src/app/api/*` (validées par Zod).
- `src/components/` — UI client : `ui.tsx` (Button, Card, Chips, Stepper,
  BudgetGauge, Sheet, IngredientPicker, Notice), `AppNav.tsx`, et un dossier par écran
  (`planner/`, `pantry/`, `exclusions/`, `stores/`, `history/`).
- `src/lib/domain/` — types du domaine + schémas **Zod** (source de vérité).
- `src/lib/engine/` — moteur **pur** (pas d'I/O, déterministe) : `money`, `units`,
  `filterRecipes`, `computeRecipeCost`, `buildShoppingList`, `optimizeMenu`,
  `evaluateMenu`, `swapOptions`.
- `src/lib/pricing/` — `PriceProvider`, résolution des prix par magasin, import CSV,
  import Open Prices (`openprices.ts`, règles dans `openprices-rules.ts`). Un
  ingrédient avec des prix `openprices` n'utilise plus les estimations ; les relevés
  > 1,5 × l'estimation sont ignorés.
- `src/lib/llm/` — `RecipeGenerator` + implémentation Anthropic (`claude-opus-5-5`),
  désactivé sauf `RECIPE_GENERATOR_ENABLED=true`.
- `src/lib/server/` — Prisma, utilisateur anonyme (cookie posé par `src/middleware.ts`),
  profil d'exclusions, contexte moteur.
- `src/lib/client/` — appels API (`api.ts`), état persistant (`storage.ts`), helpers
  de liste de courses.
- `data/` — seed JSON (258 ingrédients, 268 recettes, magasins) ; `prisma/` — schéma,
  migrations, seed ; `docs/` — choix techniques.

## Conventions

- **Argent : toujours en centimes entiers.** Jamais de flottant pour un montant ;
  formatage via `formatEuros`, chiffres tabulaires (`tabular-nums`) à l'affichage.
- **Quantités** en unité de base : `g`, `ml` ou `piece`.
- **Budget = coût en caisse** : conditionnements entiers ; le placard compte 0 €.
- Régime et allergènes d'une recette **dérivés de ses ingrédients**, jamais saisis.
- Le LLM ne fournit **jamais** un prix : tout prix est recalculé par le moteur.
- Les prix seed sont des **estimations** — l'UI doit le dire.
- TypeScript strict, pas de `any`. Validation Zod à chaque frontière.
- Textes UI en **français**, écrits du point de vue de l'utilisateur.
- Couleurs via **tokens** (variables CSS) plutôt que des couleurs en dur ; un thème
  clair reste disponible.
- Pas de compte : utilisateur anonyme ; tout est rattaché à un `userId`.
- Pages qui lisent la base : `export const dynamic = "force-dynamic"`.
- Tests du moteur à côté du code (`*.test.ts`) ; test d'acceptation clé :
  `optimize.test.ts` (100 combinaisons, budget jamais dépassé, aucun aliment exclu,
  < 2 s).
- Commits petits et clairs.
