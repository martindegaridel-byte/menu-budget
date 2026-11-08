"use client";
import { BellRing, Check, ChefHat, ChevronLeft, ChevronRight, Mic, MicOff, Pause, Play, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { findTimers, formatClock } from "@/lib/client/timers";
import { forSpeech, parseVoiceCommand, type VoiceCommand } from "@/lib/client/voice";

/** Reconnaissance vocale du navigateur (Chrome, Safari) : types minimaux, l'API n'est pas dans le DOM standard. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

function say(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("fr"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

interface RunningTimer {
  id: number;
  label: string;
  step: number;
  /** Fin prévue (horodatage) ; null quand le minuteur est en pause. */
  endsAt: number | null;
  /** Secondes restantes au moment de la pause. */
  remaining: number;
  done: boolean;
}

/** Bip court (Web Audio), sans fichier son. */
function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* son indisponible */
  }
}

/**
 * Mode cuisine : ingrédients à cocher, puis une étape par écran en gros texte,
 * minuteurs en un geste (durées repérées dans l'étape), écran maintenu allumé,
 * lecture à voix haute et commandes vocales.
 */
export function CookMode({
  recipeName,
  persons,
  ingredients,
  steps,
  onClose,
  endSlot,
}: {
  recipeName: string;
  persons: number;
  ingredients: { id: string; name: string; quantity: string; optional: boolean }[];
  steps: string[];
  onClose: () => void;
  /** Contenu de l'écran final (ex. noter la recette). */
  endSlot?: ReactNode;
}) {
  const [screen, setScreen] = useState(0); // 0 = ingrédients, 1..n = étapes, n + 1 = fin
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [, setTick] = useState(0);
  const nextId = useRef(1);
  const touchX = useRef<number | null>(null);
  const last = steps.length + 1;
  const go = useCallback((delta: number) => setScreen((s) => Math.min(last, Math.max(0, s + delta))), [last]);

  // Écran allumé, défilement de la page bloqué, flèches du clavier et Échap.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      void lock?.release().catch(() => undefined);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose]);

  // Tic chaque seconde tant qu'un minuteur tourne ; alerte à la fin.
  const running = timers.some((t) => t.endsAt && !t.done);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTimers((list) =>
        list.map((t) => {
          if (t.done || !t.endsAt || t.endsAt > now) return t;
          beep();
          navigator.vibrate?.([300, 150, 300, 150, 300]);
          return { ...t, done: true, remaining: 0 };
        }),
      );
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = (label: string, seconds: number, step: number) =>
    setTimers((list) => [...list, { id: nextId.current++, label, step, endsAt: Date.now() + seconds * 1000, remaining: seconds, done: false }]);
  const left = (t: RunningTimer) => (t.done ? 0 : t.endsAt ? (t.endsAt - Date.now()) / 1000 : t.remaining);
  const togglePause = (id: number) =>
    setTimers((list) => list.map((t) => (t.id !== id || t.done ? t : t.endsAt ? { ...t, endsAt: null, remaining: left(t) } : { ...t, endsAt: Date.now() + t.remaining * 1000 })));
  const remove = (id: number) => setTimers((list) => list.filter((t) => t.id !== id));

  const step = screen >= 1 && screen <= steps.length ? steps[screen - 1]! : null;
  const stepTimers = step ? findTimers(step) : [];

  // Lecture à voix haute de l'écran courant, et commandes vocales (« suivant », « précédent », « répète »…).
  const [canSpeak, setCanSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    setCanListen(recognitionCtor() !== null);
    return () => window.speechSynthesis?.cancel();
  }, []);
  const screenText = useCallback(() => {
    if (screen === 0) return `Ingrédients : ${ingredients.map((i) => `${forSpeech(i.quantity)} ${i.name}`).join(", ")}.`;
    if (screen === last) return "Terminé. Bon appétit !";
    return `Étape ${screen}. ${forSpeech(steps[screen - 1] ?? "")}`;
  }, [screen, last, ingredients, steps]);
  useEffect(() => {
    if (speaking) say(screenText());
  }, [speaking, screenText]);

  const onCommand = useRef<(c: VoiceCommand) => void>(() => undefined);
  onCommand.current = (c) => {
    if (c === "next") go(1);
    else if (c === "previous") go(-1);
    else if (c === "repeat") say(screenText());
    else if (c === "timer" && stepTimers[0]) {
      start(stepTimers[0].label, stepTimers[0].seconds, screen);
      say(`Minuteur de ${stepTimers[0].label} lancé.`);
    } else if (c === "stop") {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
  };
  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!listening || !Ctor) return;
    let active = true;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        // Pendant la lecture, le micro entend le téléphone (« ensuite… ») : on ignore.
        if (!r.isFinal || window.speechSynthesis?.speaking) continue;
        const text = r[0]?.transcript ?? "";
        const cmd = parseVoiceCommand(text);
        setHeard(cmd ? text.trim() : null);
        if (cmd) onCommand.current(cmd);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        active = false;
        setListening(false);
        setHeard("Micro refusé : autorisez-le dans les réglages du navigateur.");
      }
    };
    // Le navigateur coupe l'écoute après un silence : on la relance tant qu'elle est demandée.
    rec.onend = () => {
      if (!active) return;
      try {
        rec.start();
      } catch {
        /* déjà relancée */
      }
    };
    try {
      rec.start();
    } catch {
      setListening(false);
    }
    return () => {
      active = false;
      rec.onend = null;
      rec.stop();
    };
  }, [listening]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mode cuisine : ${recipeName}`}
      className="fixed inset-0 z-[60] flex flex-col bg-canvas"
      onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0]!.clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <ChefHat aria-hidden className="size-6 shrink-0 text-accent-text" strokeWidth={ICON_STROKE} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{recipeName}</p>
          <p className="text-caption text-muted" aria-live="polite">
            {screen === 0 ? `Ingrédients · ${persons} pers.` : screen === last ? "Terminé" : `Étape ${screen} sur ${steps.length}`}
          </p>
        </div>
        {canSpeak && (
          <IconButton
            icon={speaking ? Volume2 : VolumeX}
            label={speaking ? "Arrêter la lecture à voix haute" : "Lire les étapes à voix haute"}
            aria-pressed={speaking}
            className={cn(speaking && "bg-accent-soft text-accent-text")}
            onClick={() => {
              if (speaking) window.speechSynthesis.cancel();
              setSpeaking(!speaking);
            }}
          />
        )}
        {canListen && (
          <IconButton
            icon={listening ? Mic : MicOff}
            label={listening ? "Arrêter les commandes vocales" : "Commandes vocales : dites « suivant », « précédent », « répète »"}
            aria-pressed={listening}
            className={cn(listening && "bg-accent-soft text-accent-text")}
            onClick={() => {
              setHeard(null);
              setListening(!listening);
            }}
          />
        )}
        <IconButton icon={X} label="Quitter le mode cuisine" onClick={onClose} />
      </header>
      {listening && (
        <p className="flex items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-caption text-accent-text" aria-live="polite">
          <Mic aria-hidden className="size-4 shrink-0 animate-pulse" strokeWidth={ICON_STROKE} />
          {heard ? `Compris : « ${heard} »` : "À l'écoute : « suivant », « précédent », « répète », « minuteur », « stop »."}
        </p>
      )}
      {!listening && heard && <p className="border-b border-line px-4 py-2 text-caption text-warn-text">{heard}</p>}
      <div className="h-1 bg-surface-3" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(screen / last) * 100}%` }} />
      </div>

      {/* Minuteurs en cours, toujours visibles */}
      {timers.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2" aria-label="Minuteurs">
          {timers.map((t) => (
            <li
              key={t.id}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full py-1 pl-3 pr-1 ring-1 ring-inset",
                t.done ? "animate-pulse bg-danger-soft text-danger-text ring-danger/40" : "bg-surface-2 ring-line",
              )}
            >
              {t.done ? <BellRing aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> : <Timer aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />}
              <span className="text-body-sm font-semibold tabular-nums" role="timer" aria-label={`Minuteur ${t.label}, étape ${t.step}`}>
                {t.done ? "Terminé !" : formatClock(left(t))}
              </span>
              <span className="text-caption text-muted">· ét. {t.step}</span>
              {!t.done && <IconButton icon={t.endsAt ? Pause : Play} label={t.endsAt ? "Mettre en pause" : "Reprendre"} className="size-9" onClick={() => togglePause(t.id)} />}
              <IconButton icon={X} label="Arrêter le minuteur" className="size-9" onClick={() => remove(t.id)} />
            </li>
          ))}
        </ul>
      )}

      <main className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl">
          {screen === 0 && (
            <section aria-label="Ingrédients">
              <h2 className="mb-1 text-title-2 font-semibold">Préparez vos ingrédients</h2>
              <p className="mb-4 text-body-sm text-muted">Cochez au fur et à mesure.</p>
              <ul className="space-y-2">
                {ingredients.map((i) => {
                  const on = checked.has(i.id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const next = new Set(checked);
                          if (on) next.delete(i.id);
                          else next.add(i.id);
                          setChecked(next);
                        }}
                        className="focus-ring flex min-h-14 w-full items-center gap-4 rounded-card bg-surface px-4 text-left ring-1 ring-inset ring-line"
                      >
                        <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-[9px] ring-2 ring-inset", on ? "bg-accent-2 ring-accent-2" : "ring-line-strong")}>
                          {on && <Check className="size-4 text-accent-fg" strokeWidth={3} />}
                        </span>
                        <span className={cn("flex-1 text-body", on && "text-subtle line-through")}>
                          {i.name}
                          {i.optional && <span className="text-caption text-subtle"> (facultatif)</span>}
                        </span>
                        <span className="text-body font-semibold tabular-nums text-muted">{i.quantity}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {step && (
            <section aria-label={`Étape ${screen}`}>
              <p className="mb-3 text-caption font-semibold uppercase tracking-wider text-accent-text">Étape {screen}</p>
              <p className="text-[1.6rem] font-medium leading-snug [text-wrap:pretty] sm:text-[1.9rem]">{step}</p>
              {stepTimers.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {stepTimers.map((t) => (
                    <Button key={t.label} variant="secondary" size="lg" icon={Timer} onClick={() => start(t.label, t.seconds, screen)}>
                      Minuteur {t.label}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          )}

          {screen === last && (
            <section aria-label="Terminé" className="text-center">
              <span className="mx-auto mb-4 grid size-16 place-items-center rounded-sheet bg-accent-soft text-accent-text">
                <ChefHat aria-hidden className="size-8" strokeWidth={ICON_STROKE} />
              </span>
              <h2 className="text-title-1 font-semibold">Bon appétit !</h2>
              <div className="mx-auto mt-6 max-w-md text-left">{endSlot}</div>
            </section>
          )}
        </div>
      </main>

      <footer className="flex gap-2 border-t border-line px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <Button variant="secondary" size="lg" icon={ChevronLeft} disabled={screen === 0} onClick={() => go(-1)} className="flex-1">
          Précédent
        </Button>
        {screen < last ? (
          <Button size="lg" iconRight={ChevronRight} onClick={() => go(1)} className="flex-[2]">
            {screen === 0 ? "Commencer" : screen === steps.length ? "Terminer" : "Suivant"}
          </Button>
        ) : (
          <Button size="lg" icon={Check} onClick={onClose} className="flex-[2]">
            Fermer
          </Button>
        )}
      </footer>
    </div>
  );
}
