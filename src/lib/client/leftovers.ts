/** Compteur « restes finis » : euros économisés grâce au placard, menu par menu (gardé dans le navigateur). */
export const LEFTOVERS_KEY = "mb:leftovers-saved";

export interface LeftoversLog {
  totalCents: number;
  /** Menus déjà comptés (clé du menu), pour ne pas compter deux fois les mêmes courses. */
  counted: string[];
}

export const EMPTY_LOG: LeftoversLog = { totalCents: 0, counted: [] };

/** Ajoute les économies d'un menu au compteur (une seule fois par menu). */
export function addLeftoverSavings(log: LeftoversLog, menuKey: string, cents: number): LeftoversLog {
  if (cents <= 0 || log.counted.includes(menuKey)) return log;
  return { totalCents: log.totalCents + cents, counted: [...log.counted, menuKey].slice(-50) };
}

export function readLeftovers(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): LeftoversLog {
  try {
    const v = JSON.parse(storage?.getItem(LEFTOVERS_KEY) ?? "null") as LeftoversLog | null;
    return v && typeof v.totalCents === "number" && Array.isArray(v.counted) ? v : EMPTY_LOG;
  } catch {
    return EMPTY_LOG;
  }
}

export function recordLeftovers(menuKey: string, cents: number) {
  try {
    localStorage.setItem(LEFTOVERS_KEY, JSON.stringify(addLeftoverSavings(readLeftovers(), menuKey, cents)));
  } catch {
    /* stockage indisponible */
  }
}
