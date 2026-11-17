import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { NotesService } from "../lib/notes";
import { getStore, type DocStore } from "../lib/store";

/**
 * Bloc-notes de l'accueil :
 *   GET /api/notes   → { text, updatedAt }
 *   PUT /api/notes   { text } (10 000 caractères au plus) → { text, updatedAt }
 */
export function notesHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const notes = new NotesService((deps.store ?? getStore)(), deps.now);
    if (req.method === "PUT") return { jsonBody: await notes.save(user.userId, await req.json().catch(() => null)) };
    return { jsonBody: await notes.get(user.userId) };
  }, deps.verifier);
}

app.http("notes", { methods: ["GET", "PUT"], authLevel: "anonymous", route: "notes", handler: notesHandler() });
