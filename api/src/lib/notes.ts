/**
 * Le bloc-notes de l'accueil : un seul texte libre par utilisateur (document « notes » du conteneur
 * des profils). Pas envoyé à l'IA de l'app ; un agent IA relié par une clé peut le lire et y ajouter
 * des lignes (jamais l'effacer).
 */
import { z } from "zod";
import { containers, messages } from "./models";
import type { DocStore } from "./store";

export const NOTES_DOC = "notes";
export const NOTES_MAX = 10000;

export const notesInputSchema = z.object({ text: z.string().max(NOTES_MAX, messages.tooLong(NOTES_MAX)) });

type NotesDoc = { id: typeof NOTES_DOC; userId: string; text: string; updatedAt: string };
export type Notes = { text: string; updatedAt: string | null };

export class NotesService {
  constructor(private store: DocStore, private now: () => Date = () => new Date()) {}

  async get(userId: string): Promise<Notes> {
    const doc = await this.store.get<NotesDoc>(containers.profiles, userId, NOTES_DOC);
    return { text: doc?.text ?? "", updatedAt: doc?.updatedAt ?? null };
  }

  async save(userId: string, input: unknown): Promise<Notes> {
    const { text } = notesInputSchema.parse(input);
    const doc: NotesDoc = { id: NOTES_DOC, userId, text: text.trimEnd(), updatedAt: this.now().toISOString() };
    await this.store.put(containers.profiles, doc);
    return { text: doc.text, updatedAt: doc.updatedAt };
  }

  /** Ajoute une ligne à la fin (utilisé par les agents) ; refuse si le bloc-notes déborderait. */
  async append(userId: string, line: string): Promise<Notes> {
    const current = await this.get(userId);
    const clean = line.trim();
    if (!clean) return current;
    return this.save(userId, { text: current.text ? `${current.text}\n${clean}` : clean });
  }
}
