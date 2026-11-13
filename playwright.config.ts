import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout : parcours principal sur un vrai serveur (build de production).
 * Lancer : `npm run e2e` (construit l'appli puis démarre `next start` sur le port 3200).
 */
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "fr-FR",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
