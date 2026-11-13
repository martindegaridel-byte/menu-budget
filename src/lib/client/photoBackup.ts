import { z } from "zod";

/**
 * Vos photos de plats dans le fichier de sauvegarde. Elles passent une par une par la route
 * photo (et non par /api/import), pour rester sous la limite de taille d'une requête.
 */
export const BackupPhotoSchema = z.object({
  recipeId: z.string().min(1).max(200),
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(900_000),
});
export type BackupPhoto = z.infer<typeof BackupPhotoSchema>;

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
  blob(): Promise<Blob>;
}>;

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
};

/** Récupère toutes vos photos pour la sauvegarde (une photo illisible est ignorée). */
export async function exportPhotos(fetchFn: FetchLike = fetch): Promise<BackupPhoto[]> {
  const res = await fetchFn("/api/photos");
  if (!res.ok) return [];
  const { photos } = (await res.json()) as { photos: { recipeId: string }[] };
  const out: BackupPhoto[] = [];
  for (const p of photos) {
    const img = await fetchFn(`/api/photos/${encodeURIComponent(p.recipeId)}`);
    if (!img.ok) continue;
    const parsed = BackupPhotoSchema.safeParse({ recipeId: p.recipeId, dataUrl: await blobToDataUrl(await img.blob()) });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Restaure les photos du fichier sans écraser celles déjà présentes sur ce compte.
 * Renvoie le nombre de photos ajoutées.
 */
export async function importPhotos(raw: unknown, fetchFn: FetchLike = fetch): Promise<number> {
  const list = z.array(z.unknown()).safeParse(raw);
  if (!list.success) return 0;
  const res = await fetchFn("/api/photos");
  const have = new Set(res.ok ? ((await res.json()) as { photos: { recipeId: string }[] }).photos.map((p) => p.recipeId) : []);
  let n = 0;
  for (const item of list.data) {
    const p = BackupPhotoSchema.safeParse(item);
    if (!p.success || have.has(p.data.recipeId)) continue;
    const put = await fetchFn(`/api/photos/${encodeURIComponent(p.data.recipeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: p.data.dataUrl }),
    });
    if (put.ok) {
      have.add(p.data.recipeId);
      n++;
    }
  }
  return n;
}
