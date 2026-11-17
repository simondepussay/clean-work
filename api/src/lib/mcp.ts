/**
 * Serveur MCP de Clean Work (Model Context Protocol, transport « Streamable HTTP » sans état) :
 * l'agent IA de l'utilisateur (Claude, ChatGPT…) lit et remplit son 就活 à sa place.
 *
 * Ce qu'un agent peut faire (portée « read ») : lire les candidatures, les échéances à venir, le bloc-notes.
 * En plus (portée « write ») : ajouter une candidature, la faire avancer, ajouter au calendrier,
 * enregistrer une ES, ajouter une ligne au bloc-notes.
 *
 * Ce qu'un agent ne peut pas faire, exprès :
 *   - rien supprimer (une page lue par l'agent pourrait contenir des instructions piégées) ;
 *   - lire ou écrire こころ et le journal (données sensibles, promises hors de toute IA) ;
 *   - gagner des points : le score reste celui des gestes de l'utilisateur.
 */
import { z, ZodError } from "zod";
import type { AgentIdentity } from "./agentKeys";
import { applicationStatuses, stepTypes, type Application, type Plan } from "./models";
import { NotesService } from "./notes";
import { Repository } from "./repository";
import type { DocStore } from "./store";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "clean-work", title: "Clean Work", version: "1.0.0" };

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

type Ctx = { agent: AgentIdentity; store: DocStore; now: () => Date };
type Tool = {
  name: string;
  title: string;
  description: string;
  write: boolean;
  input: z.ZodObject;
  run: (args: never, ctx: Ctx) => Promise<unknown>;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("HH:MM, Japan time");

/** Ce que l'agent voit d'une candidature : l'essentiel, sans les notes longues ni la recherche. */
function brief(a: Application) {
  return {
    id: a.id, company: a.company, position: a.position ?? null, status: a.status, nextDeadline: a.nextDeadline,
    url: a.url ?? null,
    steps: a.steps.map((s) => ({ type: s.type, dueDate: s.dueDate ?? null, time: s.time ?? null, done: s.done, place: s.place ?? null })),
  };
}

const tool = <S extends z.ZodObject>(t: Omit<Tool, "input" | "run"> & { input: S; run: (args: z.infer<S>, ctx: Ctx) => Promise<unknown> }) => t as unknown as Tool;

export const TOOLS: Tool[] = [
  tool({
    name: "list_applications", title: "List applications", write: false,
    description: "List the user's job applications (company, position, current stage, next deadline, steps).",
    input: z.object({}),
    run: async (_a, { agent, store, now }) => (await new Repository(store, now).listApplications(agent.userId)).map(brief),
  }),
  tool({
    name: "upcoming", title: "Upcoming deadlines and events", write: false,
    description: "Interviews, deadlines, events and goals in the next days, from applications and the calendar, soonest first.",
    input: z.object({ days: z.number().int().min(1).max(90).default(14).describe("How many days ahead (default 14)") }),
    run: async ({ days }, { agent, store, now }) => {
      const repo = new Repository(store, now);
      const from = now().toISOString().slice(0, 10);
      const to = new Date(now().getTime() + days * 86400_000).toISOString().slice(0, 10);
      const inRange = (d?: string) => !!d && d >= from && d <= to;
      const items = [
        ...(await repo.listApplications(agent.userId)).flatMap((a) => a.steps.filter((s) => !s.done && inRange(s.dueDate))
          .map((s) => ({ date: s.dueDate!, time: s.time ?? null, what: `${a.company} — ${s.type}`, applicationId: a.id }))),
        ...(await repo.listPlans(agent.userId)).filter((p: Plan) => !p.done && inRange(p.date))
          .map((p) => ({ date: p.date, time: p.time ?? null, what: `${p.kind}: ${p.title}`, planId: p.id })),
      ];
      return items.sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
    },
  }),
  tool({
    name: "read_notes", title: "Read the notepad", write: false,
    description: "Read the user's free-form notepad (shown at the bottom of the Home page).",
    input: z.object({}),
    run: async (_a, { agent, store, now }) => new NotesService(store, now).get(agent.userId),
  }),
  tool({
    name: "add_application", title: "Add an application", write: true,
    description: "Add a job application. Use it after the user applied, registered for an entry, or wants to track a company.",
    input: z.object({
      company: z.string().min(1).max(100),
      position: z.string().max(100).optional(),
      status: z.enum(applicationStatuses).optional().describe("Current stage; default 'interested'"),
      url: z.string().url().optional().describe("Job posting or recruiting page"),
      notes: z.string().max(5000).optional().describe("What the user knows about the company, or the job posting text"),
      steps: z.array(z.object({ type: z.enum(stepTypes), dueDate: isoDate.optional(), time: hhmm.optional(), place: z.string().max(300).optional() })).max(10).optional()
        .describe("Known upcoming steps (ES deadline, test, interviews) with dates"),
    }),
    run: async (args, { agent, store, now }) => {
      const steps = (args.steps ?? []).map((s, i) => ({ id: `agent-${Date.now()}-${i}`, ...s }));
      return brief(await new Repository(store, now).createApplication(agent.userId, { ...args, steps }));
    },
  }),
  tool({
    name: "update_application", title: "Move an application forward", write: true,
    description: "Update an application: change its stage, add an upcoming step (e.g. the 2nd interview date), or mark a step done. Never deletes anything.",
    input: z.object({
      id: z.string().min(1).describe("Application id from list_applications"),
      status: z.enum(applicationStatuses).optional(),
      addStep: z.object({ type: z.enum(stepTypes), dueDate: isoDate.optional(), time: hhmm.optional(), place: z.string().max(300).optional(), note: z.string().max(500).optional() }).optional(),
      markDone: z.enum(stepTypes).optional().describe("Mark the step of this type as done"),
      appendNote: z.string().max(1000).optional().describe("A line added at the end of the application's notes"),
    }),
    run: async ({ id, status, addStep, markDone, appendNote }, { agent, store, now }) => {
      const repo = new Repository(store, now);
      const current = (await repo.listApplications(agent.userId)).find((a) => a.id === id);
      if (!current) throw new UserFacingError("No application with this id. Call list_applications first.");
      let steps = current.steps;
      if (markDone) steps = steps.map((s) => (s.type === markDone ? { ...s, done: true } : s));
      if (addStep) steps = [...steps, { id: `agent-${Date.now()}`, done: false, ...addStep }];
      const notes = appendNote ? [current.notes, appendNote.trim()].filter(Boolean).join("\n") : undefined;
      const updated = await repo.updateApplication(agent.userId, id, { ...(status ? { status } : {}), steps, ...(notes ? { notes } : {}) });
      return updated ? brief(updated) : null;
    },
  }),
  tool({
    name: "add_calendar_item", title: "Add to the calendar", write: true,
    description: "Add an event (説明会, job fair, OB訪問…), a goal with a target date, or a short note on a date to the user's calendar.",
    input: z.object({
      kind: z.enum(["event", "goal", "note"]).default("event"),
      title: z.string().min(1).max(100),
      date: isoDate,
      time: hhmm.optional(),
      note: z.string().max(500).optional(),
    }),
    run: async (args, { agent, store, now }) => {
      const p = await new Repository(store, now).createPlan(agent.userId, args);
      return { id: p.id, kind: p.kind, title: p.title, date: p.date, time: p.time ?? null };
    },
  }),
  tool({
    name: "save_es_draft", title: "Save an entry sheet draft", write: true,
    description: "Save an entry sheet (ES) answer as a new draft the user can review and edit in the app.",
    input: z.object({
      question: z.string().min(1).max(300).describe("The ES question, e.g. 学生時代に力を入れたこと"),
      body: z.string().max(5000).describe("The answer text"),
      company: z.string().max(100).optional(),
      charLimit: z.number().int().positive().max(5000).optional(),
    }),
    run: async (args, { agent, store, now }) => {
      const d = await new Repository(store, now).createDraft(agent.userId, args);
      return { id: d.id, question: d.question, company: d.company ?? null, characters: d.body.length };
    },
  }),
  tool({
    name: "add_note", title: "Add to the notepad", write: true,
    description: "Append a line to the user's notepad (Home page). Use it for reminders, ideas or things to check.",
    input: z.object({ text: z.string().min(1).max(1000) }),
    run: async ({ text }, { agent, store, now }) => {
      const notes = await new NotesService(store, now).append(agent.userId, text);
      return { saved: true, characters: notes.text.length };
    },
  }),
];

/** Erreur à montrer telle quelle à l'agent (isError dans le résultat de l'outil). */
export class UserFacingError extends Error {}

const visibleTools = (agent: AgentIdentity) => TOOLS.filter((t) => agent.scope === "write" || !t.write);

function describe(t: Tool) {
  return {
    name: t.name, title: t.title, description: t.description,
    inputSchema: z.toJSONSchema(t.input, { io: "input" }),
    annotations: { readOnlyHint: !t.write, destructiveHint: false, idempotentHint: !t.write, openWorldHint: false },
  };
}

const ok = (id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Traite un message JSON-RPC ; null pour une notification (pas de réponse). */
export async function handleMcp(message: unknown, ctx: Ctx): Promise<JsonRpcResponse | null> {
  const m = message as Partial<JsonRpcRequest> | null;
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(null, -32600, "Invalid Request");
  const isNotification = m.id === undefined;
  if (isNotification) return null;

  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Clean Work is the user's job-hunting (就活) organiser in Japan. Read applications and upcoming deadlines, "
          + "and — with a write key — add or move applications, calendar items, ES drafts and notepad lines. Nothing can be deleted. "
          + "Dates are YYYY-MM-DD and times HH:MM in Japan time. Confirm with the user before adding things they did not ask for.",
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: visibleTools(ctx.agent).map(describe) });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      const t = TOOLS.find((x) => x.name === name);
      if (!t) return fail(m.id, -32602, `Unknown tool: ${name}`);
      if (t.write && ctx.agent.scope !== "write") {
        return ok(m.id, { content: [{ type: "text", text: "This key is read-only. Ask the user to create a key with write access in Clean Work (Account → AI agents)." }], isError: true });
      }
      try {
        const args = t.input.parse(m.params?.arguments ?? {});
        const result = await t.run(args as never, ctx);
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: Array.isArray(result) ? { items: result } : (result as object) ?? {} });
      } catch (e) {
        if (e instanceof ZodError) {
          const detail = e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
          return ok(m.id, { content: [{ type: "text", text: `Invalid input — ${detail}` }], isError: true });
        }
        if (e instanceof UserFacingError) return ok(m.id, { content: [{ type: "text", text: e.message }], isError: true });
        throw e;
      }
    }
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}
