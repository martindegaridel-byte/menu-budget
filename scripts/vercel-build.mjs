// Construction pour l'hébergement en ligne (Vercel) : base Postgres au lieu de SQLite.
// En local, rien ne change : `npm run build` utilise toujours SQLite (prisma/schema.prisma).
//
// Étapes : 1) écrire prisma/postgres/schema.prisma (même schéma, fournisseur Postgres),
// 2) générer le client Prisma, 3) créer / mettre à jour les tables (db push),
// 4) charger ingrédients, prix et recettes (seed), 5) construire Next.js.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};

if (!process.env.DATABASE_URL) {
  console.warn(
    "\n[menu-budget] DATABASE_URL absente : aucune base de données n'est reliée.\n" +
      "Dans Vercel : onglet Storage → Create Database → Neon (Postgres) → Connect, puis « Redeploy ».\n",
  );
  run("next build");
  process.exit(0);
}

const direct = process.env.DATABASE_URL_UNPOOLED ? '\n  directUrl = env("DATABASE_URL_UNPOOLED")' : "";
const schema = readFileSync("prisma/schema.prisma", "utf8").replace(
  /datasource db \{[^}]*\}/,
  `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")${direct}\n}`,
);
mkdirSync("prisma/postgres", { recursive: true });
writeFileSync("prisma/postgres/schema.prisma", `// Fichier généré par scripts/vercel-build.mjs : ne pas modifier.\n${schema}`);

const SCHEMA = "--schema prisma/postgres/schema.prisma";
run(`prisma generate ${SCHEMA}`);
run(`prisma db push ${SCHEMA} --skip-generate`);
run("tsx prisma/seed.ts");
run("next build");
