/**
 * Demandes de participation à la bêta TestFlight (formulaire public, sans compte).
 *
 * Une demande = l'e-mail du compte Apple, l'appareil, un mot facultatif. Elle est gardée dans le conteneur
 * « content », partition « _beta », sous un identifiant tiré de l'e-mail (une seule demande par adresse).
 * Chaque matin, la tâche planifiée lit les nouvelles demandes et les envoie au propriétaire (issue GitHub → e-mail),
 * qui invite les testeurs dans App Store Connect. Les demandes sont effacées 180 jours après leur arrivée.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { containers } from "./models";
import type { DocStore } from "./store";

export const BETA = "_beta";
const RETENTION = 180 * 86400;
/** Au plus 5 demandes par jour depuis une même connexion, 200 en tout : de quoi décourager les robots. */
const PER_IP = 5, PER_DAY = 200;

export const betaRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("メールアドレスが正しくありません / Invalid email address").max(200),
  device: z.enum(["iphone", "ipad", "both"]),
  message: z.string().trim().max(500).optional(),
  lang: z.enum(["ja", "en", "fr"]).default("ja"),
  consent: z.literal(true, { errorMap: () => ({ message: "同意が必要です / Consent required" }) }),
  /** Champ invisible pour les personnes : un robot qui le remplit est ignoré sans le savoir. */
  website: z.string().max(0).optional().or(z.string().transform(() => "bot")),
});

export type BetaSignup = {
  id: string;
  userId: typeof BETA;
  email: string;
  device: "iphone" | "ipad" | "both";
  message?: string;
  lang: "ja" | "en" | "fr";
  createdAt: string;
  /** Déjà envoyée au propriétaire par la tâche du matin. */
  sent: boolean;
  ttl: number;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export type SignupResult = "ok" | "duplicate" | "limited" | "ignored";

export async function addSignup(store: DocStore, input: unknown, ip: string | null, now = new Date()): Promise<SignupResult> {
  const data = betaRequestSchema.parse(input);
  if (data.website === "bot") return "ignored";
  const day = now.toISOString().slice(0, 10);
  const counter = await store.increment(containers.usage, BETA, `beta-${day}`, { all: 1, [`ip_${hash(ip ?? "?")}`]: 1 }, 3 * 86400);
  if (counter.all > PER_DAY || counter[`ip_${hash(ip ?? "?")}`] > PER_IP) return "limited";
  const id = `signup-${hash(data.email)}`;
  if (await store.get<BetaSignup>(containers.content, BETA, id)) return "duplicate";
  await store.put<BetaSignup>(containers.content, {
    id, userId: BETA, email: data.email, device: data.device, ...(data.message ? { message: data.message } : {}),
    lang: data.lang, createdAt: now.toISOString(), sent: false, ttl: RETENTION,
  });
  return "ok";
}

/** Les demandes pas encore envoyées au propriétaire ; elles sont marquées comme envoyées. */
export async function takeNewSignups(store: DocStore): Promise<Pick<BetaSignup, "email" | "device" | "message" | "lang" | "createdAt">[]> {
  const fresh = (await store.list<BetaSignup>(containers.content, BETA))
    .filter((s) => s.id.startsWith("signup-") && !s.sent)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const s of fresh) await store.put<BetaSignup>(containers.content, { ...s, sent: true });
  return fresh.map(({ email, device, message, lang, createdAt }) => ({ email, device, message, lang, createdAt }));
}
