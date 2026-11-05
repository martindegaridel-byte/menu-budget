import { StoreUpdateSchema } from "@/lib/domain/api";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

type Ctx = { params: Promise<{ id: string }> };

async function ownStore(id: string) {
  const userId = await getCurrentUserId();
  const store = await prisma.store.findFirst({ where: { id, userId } });
  if (!store) throw new HttpError(404, "Magasin introuvable (les magasins par défaut ne sont pas modifiables)");
  return store;
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const store = await ownStore((await params).id);
  const data = await parseBody(req, StoreUpdateSchema);
  await prisma.store.update({ where: { id: store.id }, data });
  return { ok: true };
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const store = await ownStore((await params).id);
  await prisma.store.delete({ where: { id: store.id } });
  return { ok: true };
});
