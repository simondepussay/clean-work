/**
 * Une offre envoyée par l'extension « Clean Work に追加 » (ou le bookmarklet) : elle arrive dans
 * l'adresse, après « #add= », encodée en base64url (UTF-8, pour le japonais).
 *
 * Après « # », rien n'est envoyé au serveur : l'offre passe du navigateur au navigateur. L'extension
 * ne voit jamais le compte de l'utilisateur ; c'est lui qui vérifie et enregistre dans 応募.
 */
// La même lecture de page que l'extension Chrome « Clean Work に追加 ».
import { extractJob, jobLink } from "../../../extension/extract.js";

export type SavedJob = {
  company?: string;
  position?: string;
  url?: string;
  location?: string;
  /** Date limite de candidature (AAAA-MM-JJ), quand la page la donne (JobPosting.validThrough). */
  deadline?: string;
  /** Résumé de l'offre, collé dans « 企業メモ・求人票 ». */
  notes?: string;
  /** Le site d'origine (« LinkedIn », « リクナビ »…). */
  source?: string;
};

/** Le bookmarklet : extractJob et jobLink recopiées dans un favori « javascript: », qui ouvre Clean Work (cette origine). */
export function bookmarkletCode(origin: string) {
  const body = `(()=>{const extractJob=${extractJob.toString()};const jobLink=${jobLink.toString()};window.open(jobLink(extractJob(),${JSON.stringify(`${origin}/`)}),"_blank")})()`;
  return `javascript:${encodeURIComponent(body)}`;
}

const LIMITS: Record<keyof SavedJob, number> = { company: 100, position: 100, url: 2000, location: 200, deadline: 10, notes: 4800, source: 60 };
export const ADD_PREFIX = "#add=";
const PENDING_KEY = "clean-work-pending-job";

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function encodeJob(job: SavedJob): string {
  return ADD_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(job)));
}

/** Lit et nettoie une offre (null si l'adresse n'en contient pas, ou si elle est illisible). */
export function decodeJob(hash: string): SavedJob | null {
  if (!hash.startsWith(ADD_PREFIX)) return null;
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromBase64Url(hash.slice(ADD_PREFIX.length)))) as Record<string, unknown>;
    const job: SavedJob = {};
    for (const key of Object.keys(LIMITS) as (keyof SavedJob)[]) {
      const value = raw[key];
      if (typeof value === "string" && value.trim()) job[key] = value.trim().slice(0, LIMITS[key]);
    }
    if (job.url && !/^https?:\/\//i.test(job.url)) delete job.url;
    if (job.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(job.deadline)) delete job.deadline;
    return job.company || job.position || job.url ? job : null;
  } catch {
    return null;
  }
}

/** L'offre attend la connexion (la page de connexion peut recharger l'onglet). */
export function keepPendingJob(job: SavedJob) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(job)); } catch { /* navigation privée stricte : tant pis */ }
}
export function takePendingJob(): SavedJob | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as SavedJob) : null;
  } catch {
    return null;
  }
}
