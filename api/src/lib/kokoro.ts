/**
 * Onglet « こころ » : la météo du moral, les valeurs de l'utilisateur et le soutien par paliers.
 *
 * Données sensibles : un seul document privé par utilisateur (« kokoro », dans le conteneur des
 * profils, partitionné par userId), jamais envoyé à l'IA, effaçable d'un geste, et supprimé avec
 * le compte comme le reste.
 *
 * Paliers de soutien (calculés ici pour que le web et l'iPhone suivent la même règle) :
 *   calm   — rien de particulier ; le lien vers les lignes d'écoute reste toujours visible.
 *   rain   — le dernier jour noté est « 雨 » : respiration, et ce qu'on a fait cette semaine.
 *   often  — au moins 3 jours de « 雨 » sur les 7 derniers jours (choix de design de l'app).
 *   long   — « 雨 » la plupart des jours (10 sur 14) : repère officiel des 2 semaines (厚生労働省),
 *            on conseille d'en parler à un professionnel.
 */
import { z } from "zod";
import { cheerFrequencies, cheersFor, readWords, type CheerFrequency, type Word } from "./cheer";
import { needsJlpt, tokyoDate } from "./reminders";
import { containers, messages, type Application, type Device, type Draft, type Profile } from "./models";
import type { Interview } from "./interview";
import type { DocStore } from "./store";

export const moodWeathers = ["sunny", "cloudy", "rainy"] as const;
export type MoodWeather = (typeof moodWeathers)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, messages.date);

/** Un jour noté. `weather: null` efface la note de ce jour. */
export const moodInputSchema = z.object({
  date: isoDate,
  weather: z.enum(moodWeathers).nullable(),
  /** Un mot pour nommer ce qu'on ressent (« 不安 », « ほっとした »…), facultatif. */
  word: z.string().trim().max(30, messages.tooLong(30)).optional(),
});

/** Jusqu'à 3 choses qui comptent pour l'utilisateur, relues avant un entretien. */
export const valuesInputSchema = z.object({
  values: z.array(z.string().trim().max(60, messages.tooLong(60))).max(3)
    .transform((list) => list.filter((v) => v.length > 0)),
});

/** お守りの言葉 : des phrases à soi, reçues sur l'iPhone avant chaque entretien (notification locale, à la minute). */
export const charmTimings = ["eve", "morning", "hour", "tenmin"] as const;
export type CharmTiming = (typeof charmTimings)[number];
export const charmsInputSchema = z.object({
  charms: z.array(z.object({
    text: z.string().trim().min(1, messages.required).max(80, messages.tooLong(80)),
    when: z.enum(charmTimings),
  })).max(6),
});
export type Charm = z.infer<typeof charmsInputSchema>["charms"][number];

export const settingsInputSchema = z.object({ cheerFrequency: z.enum(cheerFrequencies) });

/**
 * 日記 : le journal intime, une page par jour. Chaque page est un document à part (« journal-AAAA-MM-JJ ») :
 * un journal tenu des années ne fait pas grossir le document « kokoro » (limite de 2 Mo par document).
 * Il n'est jamais envoyé à l'IA, ni inclus dans /api/kokoro et /api/bootstrap (donc pas dans la copie
 * gardée sur l'appareil) : on le lit seulement quand on l'ouvre.
 */
export const JOURNAL_MAX = 4000;
export const journalInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, messages.date),
  // Absent = vide (le web retire les champs vides) : la page est effacée.
  text: z.string().max(JOURNAL_MAX, messages.tooLong(JOURNAL_MAX)).default(""),
});
export type JournalEntry = { date: string; text: string; updatedAt: string };
type JournalDoc = JournalEntry & { id: string; userId: string };
const JOURNAL_PREFIX = "journal-";

export type Mood = { date: string; weather: MoodWeather; word?: string };
export type KokoroDoc = {
  id: "kokoro"; userId: string; moods: Mood[]; values: string[];
  charms?: Charm[]; cheerFrequency?: CheerFrequency; updatedAt: string;
};

export type SupportLevel = "calm" | "rain" | "often" | "long";

const DOC_ID = "kokoro";
/** On garde un peu plus d'un an d'historique ; l'écran n'en montre que 8 semaines. */
const KEEP_DAYS = 400;
const SHOW_DAYS = 56;
const DAY = 86_400_000;

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Le palier de soutien d'après les jours notés (voir l'en-tête du fichier). */
export function supportLevel(moods: Mood[], today: string) {
  const rainyBetween = (from: string) => moods.filter((m) => m.date >= from && m.date <= today && m.weather === "rainy").length;
  const rainy7 = rainyBetween(shift(today, -6));
  const rainy14 = rainyBetween(shift(today, -13));
  const latest = [...moods].filter((m) => m.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  // Une note de plus de 2 jours ne dit plus grand-chose de l'état d'aujourd'hui.
  const recentRain = latest?.weather === "rainy" && latest.date >= shift(today, -1);
  const level: SupportLevel = rainy14 >= 10 ? "long" : rainy7 >= 3 ? "often" : recentRain ? "rain" : "calm";
  return { level, rainy7, rainy14 };
}

/** Préfecture en tête de l'adresse du profil (« 東京都新宿区… » → « 東京都 »). */
export function prefectureOf(address?: string) {
  return address?.trim().match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/)?.[1] ?? null;
}

export class KokoroService {
  constructor(private store: DocStore, private now: () => Date = () => new Date(), private words: () => Word[] = readWords) {}

  async doc(userId: string): Promise<KokoroDoc> {
    return (await this.store.get<KokoroDoc>(containers.profiles, userId, DOC_ID))
      ?? { id: DOC_ID, userId, moods: [], values: [], updatedAt: this.now().toISOString() };
  }

  /**
   * Tout ce que l'écran « こころ » affiche. `today` est la date locale de l'appareil (le Japon
   * pour la plupart des utilisateurs) ; sans elle, la date du serveur.
   */
  async view(userId: string, today = tokyoDate(this.now())) {
    const [doc, profile, apps, drafts, interviews, devices] = await Promise.all([
      this.doc(userId),
      this.store.get<Profile>(containers.profiles, userId, userId),
      this.store.list<Application>(containers.applications, userId),
      this.store.list<Draft>(containers.drafts, userId),
      this.store.list<Interview>(containers.interviews, userId),
      this.store.list<Device>(containers.devices, userId),
    ]);
    const weekStart = `${shift(today, -6)}T00:00:00`;
    const since = (d?: string) => (d ?? "") >= weekStart;
    return {
      moods: doc.moods.filter((m) => m.date > shift(today, -SHOW_DAYS)),
      values: doc.values,
      support: supportLevel(doc.moods, today),
      // « Ce que tu as fait cette semaine » : les jours de pluie, on montre le chemin parcouru.
      week: {
        applications: apps.filter((a) => since(a.createdAt)).length,
        drafts: drafts.filter((d) => since(d.updatedAt)).length,
        interviews: interviews.filter((i) => since(i.createdAt)).length,
        rejections: apps.filter((a) => a.status === "rejected" && since(a.updatedAt)).length,
      },
      // Félicitations, réconfort, petites poussées vers les autres onglets, mot du jour (voir cheer.ts).
      cheers: cheersFor({ userId, apps, drafts, interviews, moods: doc.moods, values: doc.values, today, now: this.now(), words: this.words() }),
      charms: doc.charms ?? [],
      cheerFrequency: doc.cheerFrequency ?? "daily",
      // iPhone reliés au compte (ils reçoivent les notifications).
      devices: { count: devices.length, lastSeen: devices.map((d) => d.updatedAt).sort().at(-1) ?? null },
      // Personnalisation des aides : la région (新卒応援ハローワーク), et des lignes en anglais pour
      // les étudiants dont le japonais n'est pas la langue maternelle.
      prefecture: prefectureOf(profile?.address),
      international: needsJlpt(profile),
    };
  }

  async setMood(userId: string, input: unknown) {
    const { date, weather, word } = moodInputSchema.parse(input);
    const today = this.now().toISOString().slice(0, 10);
    // Le fuseau de l'appareil peut avoir un jour d'avance sur le serveur (UTC), pas plus.
    if (date > shift(today, 1) || date < shift(today, -SHOW_DAYS)) {
      throw new z.ZodError([{ code: "custom", path: ["date"], message: messages.date }]);
    }
    const doc = await this.doc(userId);
    const others = doc.moods.filter((m) => m.date !== date && m.date > shift(today, -KEEP_DAYS));
    const moods = weather ? [...others, { date, weather, ...(word ? { word } : {}) }] : others;
    moods.sort((a, b) => a.date.localeCompare(b.date));
    await this.store.put<KokoroDoc>(containers.profiles, { ...doc, moods, updatedAt: this.now().toISOString() });
  }

  async setValues(userId: string, input: unknown) {
    const { values } = valuesInputSchema.parse(input);
    const doc = await this.doc(userId);
    await this.store.put<KokoroDoc>(containers.profiles, { ...doc, values, updatedAt: this.now().toISOString() });
    return values;
  }

  async setCharms(userId: string, input: unknown) {
    const { charms } = charmsInputSchema.parse(input);
    const doc = await this.doc(userId);
    await this.store.put<KokoroDoc>(containers.profiles, { ...doc, charms, updatedAt: this.now().toISOString() });
    return charms;
  }

  async setSettings(userId: string, input: unknown) {
    const { cheerFrequency } = settingsInputSchema.parse(input);
    const doc = await this.doc(userId);
    await this.store.put<KokoroDoc>(containers.profiles, { ...doc, cheerFrequency, updatedAt: this.now().toISOString() });
    return { cheerFrequency };
  }

  /** Les pages du journal, la plus récente d'abord. */
  async journal(userId: string): Promise<JournalEntry[]> {
    return (await this.store.list<JournalDoc>(containers.profiles, userId))
      .filter((d) => d.id.startsWith(JOURNAL_PREFIX))
      .map(({ date, text, updatedAt }) => ({ date, text, updatedAt }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Écrit la page d'un jour (une page vide l'efface). Pas de page dans le futur (un jour d'avance toléré : fuseau). */
  async writeJournal(userId: string, input: unknown): Promise<JournalEntry | null> {
    const { date, text } = journalInputSchema.parse(input);
    if (date > shift(this.now().toISOString().slice(0, 10), 1)) {
      throw new z.ZodError([{ code: "custom", path: ["date"], message: messages.date }]);
    }
    const id = `${JOURNAL_PREFIX}${date}`;
    if (!text.trim()) {
      await this.store.remove(containers.profiles, userId, id);
      return null;
    }
    const entry = { date, text: text.replace(/\s+$/, ""), updatedAt: this.now().toISOString() };
    await this.store.put<JournalDoc>(containers.profiles, { id, userId, ...entry });
    return entry;
  }

  /** Efface tout (humeurs, valeurs, phrases, journal), tout de suite : rien à garder pour une restauration. */
  async erase(userId: string) {
    const pages = (await this.store.list<JournalDoc>(containers.profiles, userId)).filter((d) => d.id.startsWith(JOURNAL_PREFIX));
    for (const p of pages) await this.store.remove(containers.profiles, userId, p.id);
    return this.store.remove(containers.profiles, userId, DOC_ID);
  }
}
