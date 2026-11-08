# Menu Budget

Application web mobile-first : vous indiquez un **budget**, un nombre de **repas**
(1 repas = 1 plat) et vos contraintes ; l'app compose des plats dont le **coût en
caisse** respecte strictement le budget, en tenant compte de **votre placard**,
puis génère la **liste de courses** par rayon.

Prix de référence : **Intermarché Super** (estimations), avec gestion de plusieurs
magasins et saisie / import de vos propres prix.

## Fonctionnalités

- **Préférences** : budget, nombre de repas, personnes, régime (omnivore,
  flexitarien, pescétarien, végétarien, vegan), 14 allergènes, aliments exclus,
  temps max, niveau, équipement, cuisines et aliments favoris, magasin.
- **Moteur de budget** (`src/lib/engine`, fonctions pures) :
  - conditionnement réel (on achète le paquet entier, au format le moins cher) ;
  - placard déduit avant achat (0 €), sans double comptage ;
  - réutilisation d'ingrédients entre plats ;
  - optimisation glouton + recherche locale (voir [docs/algorithm.md](docs/algorithm.md)) ;
  - budget impossible → menu le moins cher + « il manque X € » + suggestions.
- **Résultat** : jauge total/budget, coût par plat et par personne, économie
  grâce au placard, remplacement d'un plat avec le nouveau prix, ajustement en
  direct du budget et du nombre de personnes.
- **Liste de courses** par rayon, cases à cocher, copier / partager, restes,
  « J'ai fait mes courses » (met le placard à jour).
- **Placard** : stock avec quantités et dates de péremption (les produits qui
  périment sont prioritaires), condiments cochés.
- **Magasins** : plusieurs magasins (indice de prix par format), prix saisis à la
  main ou importés en CSV, produits « introuvables ici ».
- **Exclusions permanentes** : aliments, familles (porc, poisson, champignons…) et
  allergènes que vous ne mangez jamais, appliqués à tous les menus.
- **Historique et favoris** (menus et recettes).
- **IA (optionnelle)** : génération de recettes via l'API Anthropic, sortie JSON
  validée par Zod ; le prix n'est jamais fourni par le LLM.

## Démarrage

Prérequis : Node.js 20+.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npx prisma migrate dev
```

(applique les migrations SQLite et lance le seed : 258 ingrédients, 268 recettes)

```bash
npm run dev
```

Puis ouvrez http://localhost:3000.

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production |
| `npm test` | tests Vitest (moteur, données, CSV, validation LLM) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict |
| `npm run check` | typecheck + lint + tests |
| `npm run db:seed` | recharge le catalogue (vos prix sont conservés) |
| `npm run db:reset` | réinitialise la base |

### Génération de recettes par IA (facultatif)

Dans `.env` :

```
ANTHROPIC_API_KEY="sk-ant-..."
RECIPE_GENERATOR_ENABLED="true"
```

Un bouton « Proposer 2 recettes » apparaît alors sous le formulaire. Les recettes
sont rejetées si elles utilisent un ingrédient inconnu ou interdit ; leur coût est
calculé par le moteur.

### Mettre l'appli en ligne (pour l'utiliser sur téléphone)

L'appli se met en ligne gratuitement sur **Vercel**, avec une base **Postgres (Neon)** :

1. Sur [vercel.com](https://vercel.com), « Continue with GitHub ».
2. « Add New… » → « Project » → importer le dépôt `menu-budget` → « Deploy ».
3. Dans le projet : onglet **Storage** → « Create Database » → **Neon** → accepter →
   « Connect » au projet (la variable `DATABASE_URL` est ajoutée automatiquement).
4. Onglet **Deployments** → « … » sur le dernier déploiement → **Redeploy**.

Le script `vercel-build` (`scripts/vercel-build.mjs`) génère alors le schéma Postgres,
crée les tables (`prisma db push`), charge ingrédients, prix et recettes, puis construit
l'appli. Chaque `git push` sur `main` est remis en ligne automatiquement ; les données
des utilisateurs (placard, menus, prix) sont conservées. En local, rien ne change : SQLite.

**Rappels du soir** (notifications) : une tâche quotidienne Vercel (`vercel.json`, vers
17 h) appelle `/api/cron/reminders`. Les clés d'envoi sont générées et gardées dans la base
au premier usage ; aucune configuration n'est nécessaire (variable `CRON_SECRET`
facultative pour réserver la tâche à Vercel). Sur iPhone, les notifications demandent
l'appli installée sur l'écran d'accueil (iOS 16.4 ou plus).

Sur le téléphone : ouvrir l'adresse `https://…vercel.app`, puis « Sur l'écran
d'accueil » (iPhone, bouton Partager) ou « Installer l'application » (Android, menu ⋮).

### Passer à Postgres

Dans `prisma/schema.prisma`, remplacez `provider = "sqlite"` par `"postgresql"`,
renseignez `DATABASE_URL`, supprimez `prisma/migrations` et lancez
`npx prisma migrate dev`. Les champs `*Json` peuvent devenir de type `Json`.

## Prix

Les prix fournis sont des **estimations** pour un Intermarché Super (marques
distributeur privilégiées, novembre 2026), pas des relevés officiels : Intermarché
ne publie pas d'API de prix et les prix varient d'un magasin à l'autre. Recalez-les
dans **Magasins** (saisie ou import CSV : `ingrédient ; libellé ; quantité ; unité ; prix`).
L'interface `PriceProvider` (`src/lib/pricing/priceBook.ts`) permet de brancher
une autre source.

### Prix réels avec Open Prices

[Open Prices](https://prices.openfoodfacts.org) (Open Food Facts) publie des prix
photographiés en magasin par la communauté. Dans **Magasins**, collez l'adresse de
la page de votre magasin (ex. `https://prices.openfoodfacts.org/locations/10`) puis
« Importer les prix » :

- chaque produit est associé à un ingrédient (`src/lib/pricing/openprices-rules.ts`) ;
- on garde le dernier prix de chaque produit, hors promotions, sur les 24 derniers mois ;
- un prix plus de 1,5 fois plus cher que le prix habituel (marque chère, bio…) est
  ignoré et le prix habituel conservé ; un prix plus de 3 fois moins cher aussi
  (mauvaise association probable) ;
- les ingrédients trouvés utilisent les prix réels ; les autres gardent les estimations.

Données Open Prices sous licence [ODbL](https://opendatacommons.org/licenses/odbl/).

## Architecture

```
data/                 seed JSON (ingrédients + formats/prix, recettes, magasins)
prisma/               schéma, migrations, seed
src/lib/domain/       types et schémas Zod (source de vérité)
src/lib/engine/       moteur pur : prix, conditionnement, placard, optimisation
src/lib/pricing/      PriceProvider, résolution des prix par magasin, import CSV
src/lib/llm/          générateur de recettes (interface + Anthropic + validation)
src/lib/server/       Prisma, utilisateur anonyme, contexte moteur
src/app/              pages et routes d'API (Next.js App Router)
src/components/       interface
```

Les montants sont toujours des **centimes entiers**. Pas de compte utilisateur pour
l'instant : un identifiant anonyme est stocké dans un cookie, et toutes les données
y sont rattachées (`getCurrentUserId` est le point d'extension pour l'authentification).
