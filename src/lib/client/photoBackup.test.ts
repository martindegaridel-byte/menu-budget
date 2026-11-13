import { describe, expect, it } from "vitest";
import { exportPhotos, importPhotos } from "./photoBackup";

const ok = (body: unknown, blob?: Blob) => ({ ok: true, json: async () => body, blob: async () => blob ?? new Blob() });

describe("sauvegarde des photos", () => {
  it("exporte chaque photo en data URL", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      if (url === "/api/photos") return ok({ photos: [{ recipeId: "croque-madame" }] });
      return ok(null, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
    };
    const photos = await exportPhotos(fetchFn);
    expect(calls).toEqual(["/api/photos", "/api/photos/croque-madame"]);
    expect(photos).toEqual([{ recipeId: "croque-madame", dataUrl: "data:image/jpeg;base64,AQID" }]);
  });

  it("restaure sans écraser une photo existante et ignore les entrées invalides", async () => {
    const puts: string[] = [];
    const fetchFn = async (url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        puts.push(url);
        return ok({ version: 1 });
      }
      return ok({ photos: [{ recipeId: "deja-la" }] });
    };
    const n = await importPhotos(
      [
        { recipeId: "deja-la", dataUrl: "data:image/jpeg;base64,AQID" },
        { recipeId: "nouvelle", dataUrl: "data:image/jpeg;base64,AQID" },
        { recipeId: "bizarre", dataUrl: "javascript:alert(1)" },
      ],
      fetchFn,
    );
    expect(n).toBe(1);
    expect(puts).toEqual(["/api/photos/nouvelle"]);
    expect(await importPhotos("pas une liste", fetchFn)).toBe(0);
  });
});
