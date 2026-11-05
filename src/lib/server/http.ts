import { NextResponse } from "next/server";
import { ZodError, type output, type ZodTypeAny } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Lit et valide le corps JSON d'une requête. */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Corps JSON invalide");
  }
  return schema.parse(raw);
}

/** Enveloppe un handler : erreurs Zod → 400, HttpError → statut, le reste → 500. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      return data instanceof Response ? data : NextResponse.json(data);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Données invalides", issues: e.issues }, { status: 400 });
      }
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
  };
}
