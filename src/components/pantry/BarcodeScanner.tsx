"use client";
import { Camera, Check, Keyboard, Loader2, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { BarcodeMatch } from "@/lib/pricing/barcode";

const UNIT = { g: "g", ml: "ml", piece: "pièce(s)" } as const;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/**
 * Scanner de code-barres (appareil photo) pour ajouter un produit au placard :
 * BarcodeDetector quand le navigateur le propose, sinon la bibliothèque ZXing.
 */
export function BarcodeScanner({ ingredients, onAdd, onClose }: { ingredients: IngredientOption[]; onAdd: (item: { ingredientId: string; quantity: number | null }) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"camera" | "loading" | "confirm" | "manual" | "error">("camera");
  const [message, setMessage] = useState<string | null>(null);
  const [match, setMatch] = useState<BarcodeMatch | null>(null);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [manual, setManual] = useState("");
  const [count, setCount] = useState(0);
  const lastCode = useRef<string | null>(null);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const sorted = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, "fr")), [ingredients]);

  const lookup = useCallback(async (code: string) => {
    if (lastCode.current === code) return;
    lastCode.current = code;
    navigator.vibrate?.(60);
    setStatus("loading");
    try {
      const m = await api.barcode(code);
      setMessage(null);
      setMatch(m);
      setIngredientId(m.ingredientId ?? "");
      setQuantity(m.quantity === null ? "" : String(m.quantity));
      setStatus("confirm");
    } catch (e) {
      setMatch({ code, name: `Produit ${code}`, brand: null, quantityLabel: null, ingredientId: null, alternatives: [], quantity: null });
      setIngredientId("");
      setQuantity("");
      setMessage(e instanceof Error ? e.message : "Produit introuvable.");
      setStatus("confirm");
    }
  }, []);

  // Caméra + détection en continu tant qu'on est sur l'écran de visée.
  useEffect(() => {
    if (status !== "camera") return;
    let stream: MediaStream | null = null;
    let stop = false;
    let zxingControls: { stop: () => void } | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = videoRef.current;
        if (!video || stop) return;
        video.srcObject = stream;
        await video.play();
        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Native) {
          const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          const loop = async () => {
            if (stop) return;
            try {
              const [hit] = await detector.detect(video);
              if (hit?.rawValue) return void lookup(hit.rawValue);
            } catch {
              /* image suivante */
            }
            setTimeout(loop, 250);
          };
          void loop();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromVideoElement(video, (res) => {
            if (res && !stop) void lookup(res.getText());
          });
        }
      } catch {
        if (!stop) {
          setMessage("Appareil photo indisponible : autorisez-le dans les réglages du navigateur, ou saisissez le code.");
          setStatus("manual");
        }
      }
    })();
    return () => {
      stop = true;
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [status, lookup]);

  const resume = () => {
    lastCode.current = null;
    setMatch(null);
    setMessage(null);
    setStatus("camera");
  };
  const ing = byId.get(ingredientId);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scanner un code-barres" className="fixed inset-0 z-[60] flex flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <ScanBarcode aria-hidden className="size-6 text-accent-text" strokeWidth={ICON_STROKE} />
        <p className="flex-1 font-semibold">Scanner un produit{count > 0 ? ` · ${count} ajouté${count > 1 ? "s" : ""}` : ""}</p>
        <IconButton icon={X} label="Fermer le scanner" onClick={onClose} />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-md space-y-4">
          {(status === "camera" || status === "loading") && (
            <div className="relative aspect-[3/4] overflow-hidden rounded-card bg-black">
              <video ref={videoRef} playsInline muted className="size-full object-cover" />
              <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-field ring-2 ring-accent" />
              <p className="absolute inset-x-0 bottom-3 text-center text-body-sm font-medium text-white drop-shadow">
                {status === "loading" ? "Recherche du produit…" : "Placez le code-barres dans le cadre"}
              </p>
              {status === "loading" && <Loader2 aria-hidden className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />}
            </div>
          )}

          {status === "confirm" && match && (
            <div className="space-y-4 rounded-card bg-surface p-4 ring-1 ring-inset ring-line">
              <div>
                <p className="text-caption text-muted">Code {match.code}</p>
                <p className="text-title-3 font-semibold">{match.name}</p>
                {(match.brand || match.quantityLabel) && <p className="text-body-sm text-muted">{[match.brand, match.quantityLabel].filter(Boolean).join(" · ")}</p>}
                {message && <p className="mt-1 text-caption text-warn-text">{message}</p>}
              </div>
              <div>
                <label htmlFor="scan-ing" className="mb-2 block text-caption font-medium text-muted">
                  Ingrédient du placard
                </label>
                <select id="scan-ing" className="input" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {match.alternatives.length > 0 && (
                    <optgroup label="Suggestions">
                      {[match.ingredientId, ...match.alternatives].filter(Boolean).map((id) => (
                        <option key={`s-${id}`} value={id!}>
                          {byId.get(id!)?.name ?? id}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Tous les ingrédients">
                    {sorted.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              {ing && !ing.staple && (
                <div>
                  <label htmlFor="scan-qty" className="mb-2 block text-caption font-medium text-muted">
                    Quantité ({UNIT[ing.unit]})
                  </label>
                  <input id="scan-qty" inputMode="decimal" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={ing.unit === "piece" ? "1" : "ex. 500"} />
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={resume}>
                  Ignorer
                </Button>
                <Button
                  className="flex-1"
                  icon={Check}
                  disabled={!ing}
                  onClick={() => {
                    if (!ing) return;
                    const q = Number(quantity.replace(",", "."));
                    onAdd({ ingredientId: ing.id, quantity: ing.staple ? null : q > 0 ? q : ing.unit === "piece" ? 1 : 500 });
                    setCount((n) => n + 1);
                    resume();
                  }}
                >
                  Ajouter et scanner un autre
                </Button>
              </div>
            </div>
          )}

          {status !== "confirm" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = manual.replace(/\D/g, "");
                if (code.length >= 8) void lookup(code);
              }}
            >
              {message && status === "manual" && <p className="text-body-sm text-warn-text">{message}</p>}
              <label htmlFor="scan-manual" className="flex items-center gap-1.5 text-caption font-medium text-muted">
                <Keyboard aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Ou saisissez les chiffres sous le code-barres
              </label>
              <div className="flex gap-2">
                <input id="scan-manual" inputMode="numeric" className="input flex-1" placeholder="ex. 3017620422003" value={manual} onChange={(e) => setManual(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={manual.replace(/\D/g, "").length < 8}>
                  Chercher
                </Button>
              </div>
              {status === "manual" && (
                <Button variant="ghost" icon={Camera} onClick={() => setStatus("camera")}>
                  Réessayer l&apos;appareil photo
                </Button>
              )}
            </form>
          )}
          <p className="text-caption text-subtle">Fiches produits : Open Food Facts (licence ODbL).</p>
        </div>
      </div>
    </div>
  );
}
