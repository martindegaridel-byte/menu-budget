import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const dynamic = "force-dynamic";

/** Taille maximale d'une photo (déjà redimensionnée par le navigateur). */
const MAX_BYTES = 600_000;
const PhotoSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/, "Image invalide").max(Math.ceil((MAX_BYTES * 4) / 3) + 40),
});
const idSchema = z.string().min(1).max(100);

type Ctx = { params: Promise<{ recipeId: string }> };

/** Votre photo d'un plat (image). */
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const recipeId = idSchema.parse((await params).recipeId);
  const userId = await getCurrentUserId();
  const photo = await prisma.recipePhoto.findUnique({ where: { userId_recipeId: { userId, recipeId } } });
  if (!photo) throw new HttpError(404, "Pas de photo");
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
});

/** Ajoute ou remplace votre photo d'un plat. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const recipeId = idSchema.parse((await params).recipeId);
  const { dataUrl } = await parseBody(req, PhotoSchema);
  const [head, b64] = dataUrl.split(",");
  const mime = head!.slice(5, head!.indexOf(";"));
  const data = Buffer.from(b64!, "base64");
  if (data.length > MAX_BYTES) throw new HttpError(413, "Photo trop lourde");
  const userId = await getCurrentUserId();
  const photo = await prisma.recipePhoto.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId, mime, data },
    update: { mime, data },
  });
  return { version: photo.updatedAt.getTime() };
});

/** Retire votre photo (la photo d'illustration revient). */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const recipeId = idSchema.parse((await params).recipeId);
  const userId = await getCurrentUserId();
  await prisma.recipePhoto.deleteMany({ where: { userId, recipeId } });
  return { ok: true };
});
