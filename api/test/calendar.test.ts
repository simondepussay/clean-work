import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { calendarHandlers } from "../src/functions/calendar";
import { buildFeed, feedToken, fold, verifyFeedToken } from "../src/lib/calendarFeed";
import type { IdentityVerifier } from "../src/lib/identity";
import { containers, type Application, type Plan } from "../src/lib/models";
import { MemoryStore } from "../src/lib/store";

const SECRET = "s".repeat(64);
const ctx = new InvocationContext({ logHandler: () => {} });
const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });

const sony: Application = {
  id: "a1", userId: "u1", company: "ソニー", status: "interview1", nextDeadline: null, createdAt: "", updatedAt: "",
  steps: [{ id: "s1", type: "interview1", dueDate: "2026-10-29", done: false, note: "本社, 3F" }],
};
const plans: Plan[] = [
  { id: "p1", userId: "u1", kind: "event", title: "合同説明会", date: "2026-10-24", time: "13:00", done: false, createdAt: "", updatedAt: "" },
  { id: "p2", userId: "u1", kind: "goal", title: "ES 3本提出", date: "2026-10-28", done: true, createdAt: "", updatedAt: "" },
];

describe("lien de calendrier", () => {
  it("le jeton désigne l'utilisateur, et ne se falsifie pas", () => {
    const token = feedToken("u1", SECRET);
    expect(verifyFeedToken(token, SECRET)).toBe("u1");
    expect(verifyFeedToken(`${token}.ics`, SECRET)).toBe("u1");
    expect(verifyFeedToken(token, "autre-secret".repeat(4))).toBeNull();
    // Changer l'utilisateur sans la signature correspondante ne marche pas.
    const [, sig] = token.split(".");
    expect(verifyFeedToken(`${Buffer.from("u2").toString("base64url")}.${sig}`, SECRET)).toBeNull();
    expect(verifyFeedToken("n'importe quoi", SECRET)).toBeNull();
  });

  it("iCalendar : étapes en journée entière, événements à l'heure de Tokyo, objectifs marqués", () => {
    const ics = buildFeed([sony], plans, "ja", new Date("2026-10-23T00:00:00Z"));
    expect(ics).toContain("SUMMARY:ソニー 一次面接");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261029");
    expect(ics).toContain("DESCRIPTION:本社\\, 3F");
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261024T130000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20261024T140000");
    expect(ics).toContain("SUMMARY:✓ 【目標】ES 3本提出");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("étape avec heure et lieu : à l'heure de Tokyo, LOCATION ; lien d'un entretien en ligne en URL", () => {
    const steps = [{ id: "s2", type: "interview2", dueDate: "2026-11-05", time: "10:30", done: false, place: "東京都港区港南1-7-1" },
      { id: "s3", type: "final", dueDate: "2026-11-12", done: false, place: "https://zoom.us/j/123" }] as Application["steps"];
    const ics = buildFeed([{ ...sony, steps }], [], "ja");
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261105T103000");
    expect(ics).toContain("LOCATION:東京都港区港南1-7-1");
    expect(ics).toContain("URL:https://zoom.us/j/123");
  });

  it("dans la langue du lien", () => {
    expect(buildFeed([sony], plans, "fr")).toContain("SUMMARY:ソニー 1er entretien");
    expect(buildFeed([sony], plans, "en")).toContain("[Goal] ES 3本提出");
  });

  it("fold ne coupe pas un caractère japonais", () => {
    const line = `SUMMARY:${"面接".repeat(40)}`;
    expect(fold(line).split("\r\n ").join("")).toBe(line);
  });
});

describe("/api/calendar-link et /api/calendar/{token}", () => {
  async function setup() {
    const store = new MemoryStore();
    await store.put(containers.applications, sony);
    for (const p of plans) await store.put(containers.plans, p);
    const h = calendarHandlers({ verifier: () => as("u1"), store: () => store, secret: () => SECRET });
    return { h };
  }

  it("donne un lien privé, que le calendrier lit sans connexion", async () => {
    const { h } = await setup();
    const res = await h.link(new HttpRequest({ url: "https://app.example/api/calendar-link?lang=fr", method: "GET", headers: { "x-shukatsu-token": "ok" } }), ctx);
    const url = (res.jsonBody as { url: string }).url;
    expect(url).toMatch(/^https:\/\/app\.example\/api\/calendar\/[\w-]+\.[\w-]+\.ics\?lang=fr$/);

    const token = new URL(url).pathname.split("/").pop()!;
    const feed = await h.feed(new HttpRequest({ url, method: "GET", params: { token } }));
    expect(feed.status).toBe(200);
    expect((feed.headers as Record<string, string>)["content-type"]).toContain("text/calendar");
    expect(feed.body as string).toContain("ソニー 1er entretien");
  });

  it("lien faux → 404 ; lien sans connexion → 401", async () => {
    const { h } = await setup();
    const bad = await h.feed(new HttpRequest({ url: "https://x/api/calendar/abc.def.ics", method: "GET", params: { token: "abc.def.ics" } }));
    expect(bad.status).toBe(404);
    const anonymous = await calendarHandlers({ verifier: () => as("u1"), secret: () => SECRET }).link(new HttpRequest({ url: "https://x/api/calendar-link", method: "GET" }), ctx);
    expect(anonymous.status).toBe(401);
  });
});
