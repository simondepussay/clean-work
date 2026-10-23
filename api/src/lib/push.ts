/**
 * Envoi des notifications push aux iPhone par APNs, le service d'Apple (S26).
 *
 * Authentification par jeton : on signe un petit JWT (ES256) avec la clé .p8 créée dans
 * Apple Developer. Apple demande de le renouveler entre 20 et 60 minutes : on le garde 40.
 * APNs n'accepte que HTTP/2, d'où `node:http2` (le `fetch` de Node parle HTTP/1.1).
 */
import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import type { Device } from "./models";

export type PushMessage = { title: string; body: string };
/** sent : accepté par Apple ; gone : jeton invalide (app supprimée…), à oublier ; failed : réessayer plus tard. */
export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  send(device: Device, message: PushMessage): Promise<PushResult>;
}

export type ApnsConfig = { keyPem: string; keyId: string; teamId: string; topic: string };
type Response = { status: number; body: string };
/** Envoie une requête HTTP/2 ; remplacé par un faux dans les tests. */
export type Transport = (host: string, path: string, headers: Record<string, string>, body: string) => Promise<Response>;

const HOSTS = { sandbox: "api.sandbox.push.apple.com", production: "api.push.apple.com" } as const;
const TOKEN_LIFETIME_MS = 40 * 60 * 1000;
/** Raisons d'un 400 qui veulent dire « ce jeton ne servira plus jamais ». */
const DEAD_TOKEN = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

export class ApnsSender implements PushSender {
  private jwt: { value: string; createdAt: number } | null = null;

  constructor(private config: ApnsConfig, private transport: Transport = http2Post, private now = () => Date.now()) {}

  /** Expéditeur configuré par les réglages de l'app, ou null s'il en manque (push désactivé). */
  static fromEnv(env = process.env): ApnsSender | null {
    const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC } = env;
    if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_TOPIC) return null;
    // La clé est rangée en base64 : un réglage d'app sur une seule ligne, sans retours à la ligne à échapper.
    const keyPem = Buffer.from(APNS_KEY, "base64").toString("utf8");
    return new ApnsSender({ keyPem, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, topic: APNS_TOPIC });
  }

  private async token() {
    if (this.jwt && this.now() - this.jwt.createdAt < TOKEN_LIFETIME_MS) return this.jwt.value;
    const key = await importPKCS8(this.config.keyPem, "ES256");
    const createdAt = this.now();
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(Math.floor(createdAt / 1000))
      .sign(key);
    this.jwt = { value, createdAt };
    return value;
  }

  async send(device: Device, message: PushMessage): Promise<PushResult> {
    const headers = {
      authorization: `bearer ${await this.token()}`,
      "apns-topic": this.config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      // Un rappel du jour n'a plus de sens le lendemain : Apple ne le garde pas plus de 12 h si l'iPhone est éteint.
      "apns-expiration": String(Math.floor(this.now() / 1000) + 12 * 3600),
    };
    const payload = JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: "default" } });
    const res = await this.transport(HOSTS[device.environment], `/3/device/${device.token}`, headers, payload);
    if (res.status === 200) return "sent";
    if (res.status === 410) return "gone";
    if (res.status === 400 && DEAD_TOKEN.has(reason(res.body))) return "gone";
    return "failed";
  }
}

function reason(body: string): string {
  try {
    return (JSON.parse(body) as { reason?: string }).reason ?? "";
  } catch {
    return "";
  }
}

/** Requête HTTP/2 vers APNs, une connexion par envoi (suffisant pour quelques dizaines d'utilisateurs). */
export const http2Post: Transport = (host, path, headers, body) =>
  new Promise((resolve, reject) => {
    const client = connect(`https://${host}`);
    const fail = (e: Error) => {
      client.close();
      reject(e);
    };
    client.on("error", fail);
    const req = client.request({ ":method": "POST", ":path": path, "content-type": "application/json", ...headers });
    req.setTimeout(10_000, () => {
      req.close();
      fail(new Error("APNs : délai dépassé"));
    });
    let status = 0;
    let data = "";
    req.on("response", (h) => (status = Number(h[":status"])));
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      client.close();
      resolve({ status, body: data });
    });
    req.on("error", fail);
    req.end(body);
  });

let shared: PushSender | null | undefined;

/** Expéditeur utilisé par les fonctions, null si APNs n'est pas configuré. */
export function getPushSender(): PushSender | null {
  if (shared === undefined) shared = ApnsSender.fromEnv();
  return shared;
}
