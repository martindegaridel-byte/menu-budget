# Menu Budget — CLAUDE.md

Application web mobile-first : l'utilisateur donne un **budget**, un nombre de
**repas** (1 repas = 1 plat, en pratique des dîners) et ses contraintes ; l'app
compose des menus dont le coût **en caisse** respecte strictement le budget, puis
génère la liste de courses. Prix de référence : **Intermarché** (Super par défaut),
multi-magasins. Le **placard** de l'utilisateur (stock déjà à la maison) est
déduit avant achat.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de dev (http://localhost:3000) |
| `npm run build` | build de production |
| `npm run test` | tests Vitest (moteur surtout) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | typecheck + lint + test (à lancer avant chaque commit) |
| `npm run db:migrate` | migration Prisma (dev) |
| `npm run db:seed` | charge ingrédients, prix, recettes, magasins |
| `npm run db:reset` | réinitialise la base + seed |

## Architecture

- `src/lib/domain/` — types du domaine + schémas **Zod** (source de vérité, indépendants de Prisma).
- `src/lib/engine/` — moteur **pur** (pas d'I/O, pas de Prisma, déterministe) :
  `money`, `units`, `filterRecipes`, `computeRecipeCost`, `buildShoppingList`,
  `optimizeMenu`, `swapRecipe`. Toutes les données arrivent en paramètres.
- `src/lib/pricing/` — interface `PriceProvider` + implémentations
  (estimations Intermarché seed, surcharges utilisateur par magasin).
- `src/lib/server/` — accès Prisma, adaptateurs vers le moteur.
- `src/app/` — Next.js App Router (pages + route handlers).
- `data/` — seed JSON (ingrédients, formats/prix, recettes, magasins).
- `prisma/` — schéma + seed.
- `docs/` — choix techniques (algorithme d'optimisation, sources de prix).

## Conventions

- **Argent : toujours en centimes entiers** (`Cents = number` entier). Jamais de
  flottant pour un montant ; arrondi uniquement à la conversion d'unités
  (`Math.ceil` pour des quantités à acheter). Formatage via `formatEuros`.
- **Quantités** en unité de base : `g`, `ml` ou `piece`.
- **Budget = coût en caisse** : on achète des conditionnements entiers ; le stock
  du placard compte 0 €. Le coût « part utilisée » est affiché à titre indicatif.
- Le régime / allergènes d'une recette sont **dérivés de ses ingrédients**, jamais saisis.
- Le LLM ne fournit **jamais** un prix : tout prix est recalculé par le moteur.
- Les prix seed sont des **estimations** (source `estimate`) — l'UI doit le dire.
- TypeScript strict, pas de `any`. Validation Zod à chaque frontière (API, seed, LLM).
- Textes UI en français ; accessibilité (labels, rôles ARIA, contraste, clavier).
- Pas de compte pour l'instant : utilisateur anonyme (cookie) ; tout est rattaché
  à un `userId` pour brancher l'auth plus tard.
- Tests du moteur écrits avant/avec l'implémentation (`*.test.ts` à côté du code).
- Commits petits et clairs, `npm run check` vert avant chaque commit.
