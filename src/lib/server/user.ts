import { cookies } from "next/headers";
import { prisma } from "./db";

const USER_COOKIE = "mb_uid";

/**
 * Utilisateur courant (anonyme, identifié par cookie). Créé à la volée.
 * Point d'extension pour l'authentification : remplacer la lecture du cookie
 * par la session de l'utilisateur connecté.
 */
export async function getCurrentUserId(): Promise<string> {
  const jar = await cookies();
  const id = jar.get(USER_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identifiant utilisateur manquant");
  await prisma.user.upsert({ where: { id }, create: { id }, update: {} });
  return id;
}
