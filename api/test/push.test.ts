import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import type { Device } from "../src/lib/models";
import { ApnsSender, type Transport } from "../src/lib/push";

const device = (environment: Device["environment"] = "sandbox"): Device =>
  ({ id: "ab".repeat(32), userId: "u1", token: "ab".repeat(32), environment, createdAt: "", updatedAt: "" });

async function setup(reply: { status: number; body?: string } = { status: 200 }) {
  // Une vraie paire de clés ES256, générée pour le test : c'est le format d'une clé .p8 d'Apple.
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const calls: { host: string; path: string; headers: Record<string, string>; body: string }[] = [];
  const transport: Transport = async (host, path, headers, body) => {
    calls.push({ host, path, headers, body });
    return { status: reply.status, body: reply.body ?? "" };
  };
  let clock = Date.parse("2026-10-23T00:00:00Z");
  const sender = new ApnsSender({ keyPem: await exportPKCS8(privateKey), keyId: "ABC123DEFG", teamId: "TEAM123456", topic: "com.example.app" },
    transport, () => clock);
  return { sender, calls, publicPem: await exportSPKI(publicKey), advance: (ms: number) => (clock += ms) };
}

describe("ApnsSender", () => {
  it("envoie à l'hôte du bon environnement, avec le sujet et un JWT signé par la clé", async () => {
    const { sender, calls, publicPem } = await setup();
    expect(await sender.send(device("sandbox"), { title: "T", body: "B" })).toBe("sent");
    await sender.send(device("production"), { title: "T", body: "B" });

    expect(calls.map((c) => c.host)).toEqual(["api.sandbox.push.apple.com", "api.push.apple.com"]);
    expect(calls[0].path).toBe(`/3/device/${"ab".repeat(32)}`);
    expect(calls[0].headers).toMatchObject({ "apns-topic": "com.example.app", "apns-push-type": "alert" });
    expect(JSON.parse(calls[0].body)).toEqual({ aps: { alert: { title: "T", body: "B" }, sound: "default" } });

    const jwt = calls[0].headers.authorization.replace("bearer ", "");
    const { payload, protectedHeader } = await jwtVerify(jwt, await importSPKI(publicPem, "ES256"));
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "ABC123DEFG" });
    expect(payload.iss).toBe("TEAM123456");
  });

  it("réutilise le JWT pendant 40 minutes, puis en signe un nouveau", async () => {
    const { sender, calls, advance } = await setup();
    const auth = () => calls.at(-1)!.headers.authorization;
    await sender.send(device(), { title: "T", body: "B" });
    const first = auth();
    advance(39 * 60_000);
    await sender.send(device(), { title: "T", body: "B" });
    expect(auth()).toBe(first);
    advance(2 * 60_000);
    await sender.send(device(), { title: "T", body: "B" });
    expect(auth()).not.toBe(first);
  });

  it("410 ou jeton invalide → gone (à oublier) ; autres erreurs → failed (réessayer)", async () => {
    expect(await (await setup({ status: 410 })).sender.send(device(), { title: "", body: "" })).toBe("gone");
    expect(await (await setup({ status: 400, body: '{"reason":"BadDeviceToken"}' })).sender.send(device(), { title: "", body: "" })).toBe("gone");
    expect(await (await setup({ status: 400, body: '{"reason":"PayloadTooLarge"}' })).sender.send(device(), { title: "", body: "" })).toBe("failed");
    expect(await (await setup({ status: 503 })).sender.send(device(), { title: "", body: "" })).toBe("failed");
  });

  it("fromEnv : null tant qu'un réglage manque", () => {
    expect(ApnsSender.fromEnv({ APNS_KEY_ID: "x", APNS_TEAM_ID: "y", APNS_TOPIC: "z" })).toBeNull();
  });
});
