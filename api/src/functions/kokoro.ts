import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { KokoroService } from "../lib/kokoro";
import { containers, type Device } from "../lib/models";
import { getPushSender, type PushSender } from "../lib/push";
import { getStore, type DocStore } from "../lib/store";

/** Notifications d'essai par jour et par compte (bouton « テスト通知 »). */
export const TEST_PUSH_PER_DAY = 3;

/**
 * Onglet « こころ » (données privées, jamais envoyées à l'IA).
 *   GET    /api/kokoro?today=YYYY-MM-DD   humeurs, valeurs, palier de soutien, encouragements, phrases, réglages, iPhone reliés
 *   PUT    /api/kokoro/mood               { date, weather: "sunny"|"cloudy"|"rainy"|null, word? } → 204
 *   PUT    /api/kokoro/values             { values: string[] (3 max) } → { values }
 *   PUT    /api/kokoro/charms             { charms: { text, when: "eve"|"morning"|"hour"|"tenmin" }[] (6 max) } → { charms }
 *   PUT    /api/kokoro/settings           { cheerFrequency: "daily"|"every2"|"weekly"|"off" } → { cheerFrequency }
 *   POST   /api/kokoro/test-push          envoie une notification d'essai aux iPhone du compte → { sent }
 *   DELETE /api/kokoro                    efface tout → 204
 */
export function kokoroHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date; push?: () => PushSender | null } = {}) {
  return withUser(async (req, user) => {
    const store = (deps.store ?? getStore)();
    const kokoro = new KokoroService(store, deps.now);
    const part = req.params.part;
    const body = () => req.json().catch(() => null);

    if (!part && req.method === "GET") {
      const today = req.query.get("today");
      return { jsonBody: await kokoro.view(user.userId, today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined) };
    }
    if (!part && req.method === "DELETE") {
      await kokoro.erase(user.userId);
      return { status: 204 };
    }
    if (part === "mood" && req.method === "PUT") {
      await kokoro.setMood(user.userId, await body());
      return { status: 204 };
    }
    if (part === "values" && req.method === "PUT") return { jsonBody: { values: await kokoro.setValues(user.userId, await body()) } };
    if (part === "charms" && req.method === "PUT") return { jsonBody: { charms: await kokoro.setCharms(user.userId, await body()) } };
    if (part === "settings" && req.method === "PUT") return { jsonBody: await kokoro.setSettings(user.userId, await body()) };
    if (part === "test-push" && req.method === "POST") {
      const sender = (deps.push ?? getPushSender)();
      if (!sender) return { status: 503, jsonBody: { error: "push_not_configured" } };
      const devices = await store.list<Device>(containers.devices, user.userId);
      if (devices.length === 0) return { status: 409, jsonBody: { error: "no_device" } };
      const day = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
      const { sent: count } = await store.increment(containers.usage, user.userId, `test-push-${day}`, { sent: 1 }, 2 * 86400);
      if (count > TEST_PUSH_PER_DAY) return { status: 429, jsonBody: { error: "limit" } };
      const lang = devices.find((d) => d.language)?.language ?? "ja";
      const message = {
        ja: { title: "Clean Work とつながっています", body: "この iPhone に、はげましのことばや締切のお知らせが届きます。" },
        en: { title: "Connected to Clean Work", body: "This iPhone will receive encouragement and deadline reminders." },
        fr: { title: "Relié à Clean Work", body: "Cet iPhone recevra encouragements et rappels d'échéances." },
      }[lang];
      const results = await Promise.all(devices.map((d) => sender.send(d, message).catch(() => "failed" as const)));
      for (const [i, r] of results.entries()) if (r === "gone") await store.remove(containers.devices, user.userId, devices[i].id);
      return { jsonBody: { sent: results.filter((r) => r === "sent").length } };
    }
    return { status: 404, jsonBody: { error: "not_found" } };
  }, deps.verifier);
}

app.http("kokoro", { methods: ["GET", "PUT", "POST", "DELETE"], authLevel: "anonymous", route: "kokoro/{part?}", handler: kokoroHandler() });
