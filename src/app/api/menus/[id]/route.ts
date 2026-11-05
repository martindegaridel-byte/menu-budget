import { UpdateMenuRequestSchema } from "@/lib/domain/api";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

type Ctx = { params: Promise<{ id: string }> };

async function own(id: string) {
  const userId = await getCurrentUserId();
  const menu = await prisma.savedMenu.findFirst({ where: { id, userId } });
  if (!menu) throw new HttpError(404, "Menu introuvable");
  return menu;
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const menu = await own((await params).id);
  return {
    id: menu.id,
    name: menu.name,
    favorite: menu.favorite,
    createdAt: menu.createdAt,
    preferences: JSON.parse(menu.preferencesJson) as unknown,
    result: JSON.parse(menu.resultJson) as unknown,
  };
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const menu = await own((await params).id);
  const data = await parseBody(req, UpdateMenuRequestSchema);
  await prisma.savedMenu.update({ where: { id: menu.id }, data });
  return { ok: true };
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const menu = await own((await params).id);
  await prisma.savedMenu.delete({ where: { id: menu.id } });
  return { ok: true };
});
