"use client";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ICON_STROKE } from "@/components/ds/cn";

/** Enregistre le service worker (installation, hors connexion) et signale l'absence de réseau. */
export function PwaSupport() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-caption font-medium text-warn-text backdrop-blur-xl lg:pl-64">
      <WifiOff aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
      Hors connexion : votre menu et votre liste de courses restent consultables.
    </div>
  );
}
