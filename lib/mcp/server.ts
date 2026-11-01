import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import packageJson from "@/package.json";
import {
  applicationStatusEnum,
  milestoneStatusEnum,
  type AgentScope,
  type ApplicationStatus,
} from "@/lib/db/schema";
import {
  addMilestone,
  createApplication,
  createApplicationIfAbsent,
  deleteMilestone,
  getApplication,
  getStats,
  listApplications,
  reopenApplication,
  resetTimeline,
  softDeleteApplication,
  updateApplication,
  updateMilestone,
} from "@/lib/services/applications";
import {
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  scopeIncludes,
} from "@/lib/agent-scope";
import {
  assertWriteBudget,
  ApiError,
} from "@/lib/utils/api";
import {
  createApplicationSchema,
  createMilestoneSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
  updateMilestoneSchema,
} from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";

/**
 * The agent's view of Ghosted, as MCP tools.
 *
 * Three rules shape this file:
 *
 * 1. **The scope decides which tools exist.** A read-only connection has no
 *    write tool registered at all, so there is no gate to forget: a prompt that
 *    asks a read-only agent to archive something gets "unknown tool", not a
 *    refusal a model could be talked around.
 * 2. **The account is out of reach by construction.** These tools call the
 *    applications service and nothing else. There is no email, password,
 *    session, export or deletion tool, because `lib/mcp/` imports no service
 *    that could express one.
 * 3. **Every write goes through the app's own validation** — the same Zod
 *    schemas and the same service functions the HTTP routes use, so an agent
 *    cannot write a row the UI would have refused.
 */

/** What a verified token hands to the factory: who, how much, and whether writes are allowed at all. */
export interface AgentContext {
  userId: string;
  scope: AgentScope;
  mustChangePassword: boolean;
}

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

function ok(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function failed(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** One place for "that did not work": an ApiError keeps its wording, a bug does not leak. */
async function attempt(work: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await work());
  } catch (error) {
    if (error instanceof ApiError) {
      const wait = (error.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      // A rate-limit refusal is only actionable with the wait attached.
      return failed(
        typeof wait === "number" && wait > 0
          ? `${error.message} Retry in ${wait} seconds.`
          : error.message,
      );
    }
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      return failed(
        `That request was not valid: ${first ? `${first.path.join(".") || "input"} — ${first.message}` : "unknown field"}`,
      );
    }
    logger.error({ err: error }, "mcp: tool call failed");
    return failed("Ghosted could not complete that request.");
  }
}

/**
 * A write is a write: the agent is held to the same gate and the same per-account
 * budget as the UI. The password rule is part of that gate — an account whose
 * operator-chosen password is still pending may read and may not write, and that
 * is true whether the write arrives from a browser session or from an agent
 * (review 2026-11-01, finding 4).
 */
function guardWrite(ctx: AgentContext): void {
  if (ctx.mustChangePassword) {
    throw new ApiError(
      403,
      "This account has to choose its own password before an agent can write anything. Reads still work.",
      "PASSWORD_CHANGE_REQUIRED",
    );
  }
  assertWriteBudget(ctx.userId, "agent");
}

/**
 * `archived` is left out of the status an edit-capable agent may set: archiving
 * is the destructive act, and it has its own full-access tool.
 */
const EDITABLE_STATUSES = applicationStatusEnum.enumValues.filter(
  (status) => status !== "archived",
) as [ApplicationStatus, ...ApplicationStatus[]];

const APPLICATION_ID = z
  .uuid()
  .describe("Application id, as returned by list_applications");

interface AgentTool {
  name: string;
  scope: AgentScope;
  register: (server: McpServer, ctx: AgentContext) => void;
}

/**
 * The whole catalog, in one list so the scope of every tool is visible at a
 * glance. `register` closures are typed individually, which is what lets each
 * tool declare its own input shape without a generic that satisfies none of
 * them.
 */
const TOOLS: AgentTool[] = [
  {
    name: "get_guide",
    scope: "read",
    register(server, ctx) {
      server.registerTool(
        "get_guide",
        {
          title: "Read the Ghosted guide",
          description:
            "How Ghosted models applications, milestones, statuses and the silence clock, plus the working rules for this connection. Read it before your first write, or when the data does not say what you expected.",
          inputSchema: {},
        },
        // Plain markdown, not the JSON envelope every other tool returns: this is
        // prose for the model, and escaping it would make it harder to read.
        async () => ({
          content: [
            { type: "text" as const, text: instructionsForScope(ctx.scope) },
          ],
        }),
      );
    },
  },
  {
    name: "list_applications",
    scope: "read",
    register(server, ctx) {
      server.registerTool(
        "list_applications",
        {
          title: "List applications",
          description:
            "The user's job applications: company, role, status, progress, when it was last updated. Filter by status or search text, and page through results. This is the index; get_application has the milestones and notes.",
          inputSchema: {
            status: z
              .enum([...applicationStatusEnum.enumValues, "ghosted"])
              .optional()
              .describe(
                "Only this status. `ghosted` includes both applications marked that way and applied/interviewing ones that have gone quiet.",
              ),
            search: z
              .string()
              .max(200)
              .optional()
              .describe("Match company, role or notes"),
            sort: z
              .enum(["company", "status", "updated_at", "progress"])
              .optional()
              .describe("Default: most recently updated first"),
            page: z.number().int().min(1).optional().describe("Default 1"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Default 20"),
          },
        },
        async (args) =>
          attempt(async () => {
            const query = listApplicationsQuerySchema.parse(args);
            const { data, pagination } = await listApplications(
              ctx.userId,
              query,
            );
            return { applications: data, pagination };
          }),
      );
    },
  },
  {
    name: "get_application",
    scope: "read",
    register(server, ctx) {
      server.registerTool(
        "get_application",
        {
          title: "Read one application",
          description:
            "Everything about one application: its milestones in order (with the ids the milestone tools need), notes, contacts and the job URL.",
          inputSchema: { applicationId: APPLICATION_ID },
        },
        async ({ applicationId }) =>
          attempt(async () => {
            const application = await getApplication(ctx.userId, applicationId);
            if (!application) throw new ApiError(404, "No such application", "NOT_FOUND");
            return application;
          }),
      );
    },
  },
  {
    name: "get_stats",
    scope: "read",
    register(server, ctx) {
      server.registerTool(
        "get_stats",
        {
          title: "Read the dashboard numbers",
          description:
            "Totals for the account as the dashboard shows them: total, active, interviewing, offers, rejected, ghosted.",
          inputSchema: {},
        },
        async () => attempt(async () => getStats(ctx.userId)),
      );
    },
  },
  {
    name: "create_application",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "create_application",
        {
          title: "Add an application",
          description:
            "File a new job application. It arrives with Ghosted's default milestone timeline, first step done today. Company and role are required; everything else is optional. It checks first: if the same posting (URL, then company + role) is already on the board, nothing is written and you get `created: false` with the row that matched — report it to the user and update that one, or call again with force: true if they want a second row (a reapplication after a rejection, say).",
          inputSchema: {
            company: z.string().min(1).max(200),
            role: z.string().min(1).max(200),
            url: z.string().max(2000).optional().describe("Job posting URL"),
            companyWebsite: z
              .string()
              .max(253)
              .optional()
              .describe("Employer's own site, e.g. stripe.com — used for the logo"),
            contactName: z.string().max(200).optional(),
            contactEmail: z.string().max(254).optional(),
            contactPhone: z.string().max(40).optional(),
            notes: z.string().max(10_000).optional(),
            force: z
              .boolean()
              .optional()
              .describe(
                "File a second row even though one already matches. Only after the user said so — this is the second press on the notice, not a way around it.",
              ),
          },
        },
        async ({ force, ...args }) =>
          attempt(async () => {
            const input = createApplicationSchema.parse(args);
            if (force) {
              // Deliberate: the user asked for a second row, so it is a plain
              // create — no existence check, no lock needed.
              guardWrite(ctx);
              return {
                created: true,
                application: await createApplication(ctx.userId, input),
              };
            }

            // The check is in the tool, not in the caller's conscience: a live
            // match writes nothing and says so.
            const result = await createApplicationIfAbsent(
              ctx.userId,
              input,
              () => guardWrite(ctx),
            );
            if (result.created) {
              return { created: true, application: result.application };
            }
            return {
              created: false,
              matchedOn: result.matchedOn,
              matches: result.matches,
              duplicateOf: result.application,
              message:
                result.application.status === "rejected" ||
                result.application.status === "archived"
                  ? `Already on the board and ${result.application.status}. A reapplication is legitimate — ask the user, then call again with force: true.`
                  : `Already on the board (${result.application.status}). Update that row instead; if the user wants a second one anyway, call again with force: true.`,
            };
          }),
      );
    },
  },
  {
    name: "find_or_create_application",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "find_or_create_application",
        {
          title: "Find an application, or file it",
          description:
            "The idempotent create: look for this application first (the posting URL, then company + role, case-insensitive; archived rows count) and return what exists, otherwise file it. Use this when the same finding can run twice — an email digest, an auto-applier, a retry — so a second run updates instead of duplicating. Reports whether it created anything, what it matched on, and how many rows matched. A match whose status is rejected or archived is a legitimate reapplication to confirm with the user; create_application is how you file that second row.",
          inputSchema: {
            company: z.string().min(1).max(200),
            role: z.string().min(1).max(200),
            url: z.string().max(2000).optional().describe("Job posting URL — the strongest identity"),
            companyWebsite: z
              .string()
              .max(253)
              .optional()
              .describe("Employer's own site, e.g. stripe.com — used for the logo"),
            contactName: z.string().max(200).optional(),
            contactEmail: z.string().max(254).optional(),
            contactPhone: z.string().max(40).optional(),
            notes: z.string().max(10_000).optional(),
          },
        },
        async (args) =>
          attempt(async () => {
            const input = createApplicationSchema.parse(args);
            // The lock inside this call is what makes it safe to run twice at
            // once; the budget is spent only if it actually writes.
            const result = await createApplicationIfAbsent(
              ctx.userId,
              input,
              () => guardWrite(ctx),
            );
            return {
              created: result.created,
              matchedOn: result.matchedOn,
              matches: result.matches,
              application: result.application,
            };
          }),
      );
    },
  },
  {
    name: "update_application",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "update_application",
        {
          title: "Change an application",
          description:
            "Edit an application's details or its status. Only the fields you send change. Status may be applied, interviewing, offer, rejected or ghosted — archiving is archive_application, which needs full access.",
          inputSchema: {
            applicationId: APPLICATION_ID,
            company: z.string().min(1).max(200).optional(),
            role: z.string().min(1).max(200).optional(),
            url: z.string().max(2000).optional(),
            companyWebsite: z.string().max(253).optional(),
            contactName: z.string().max(200).optional(),
            contactEmail: z.string().max(254).optional(),
            contactPhone: z.string().max(40).optional(),
            notes: z.string().max(10_000).optional(),
            status: z
              .enum(EDITABLE_STATUSES)
              .optional()
              .describe("Set the status by hand when the milestone timeline cannot say it"),
          },
        },
        async ({ applicationId, ...fields }) =>
          attempt(async () => {
            guardWrite(ctx);
            const input = updateApplicationSchema.parse(fields);
            // Belt to the tool schema's braces: the app schema would accept
            // `archived`, and archiving is the destructive act this scope does
            // not have (review 2026-11-01, finding 5).
            if (input.status === "archived") {
              throw new ApiError(
                403,
                "Archiving needs full access — use archive_application.",
                "SCOPE_REQUIRED",
              );
            }
            const application = await updateApplication(
              ctx.userId,
              applicationId,
              input,
            );
            if (!application) throw new ApiError(404, "No such application", "NOT_FOUND");
            return application;
          }),
      );
    },
  },
  {
    name: "add_milestone",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "add_milestone",
        {
          title: "Add a step to the timeline",
          description:
            "Add one step to an application's timeline (a call, a task, an interview round). Use it when the user describes something the timeline does not have — not to pre-fill a process that has not happened. Omit position to append it at the end.",
          inputSchema: {
            applicationId: APPLICATION_ID,
            title: z.string().min(1).max(200),
            position: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe("0-based insertion index; omit to append"),
            date: z
              .string()
              .optional()
              .describe("ISO date or date-time, e.g. 2026-10-14"),
            comment: z.string().max(5000).optional(),
          },
        },
        async ({ applicationId, ...fields }) =>
          attempt(async () => {
            guardWrite(ctx);
            const result = await addMilestone(
              ctx.userId,
              applicationId,
              createMilestoneSchema.parse(fields),
            );
            if (!result) throw new ApiError(404, "No such application", "NOT_FOUND");
            return result;
          }),
      );
    },
  },
  {
    name: "update_milestone",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "update_milestone",
        {
          title: "Change a step",
          description:
            "Edit one timeline step: retitle it to match what actually happened, mark it done or skipped, set its date, and use the comment for what a status cannot say — a rejection reason, who called, what they asked. Marking it done is what moves an application from applied to interviewing, and from interviewing to offer.",
          inputSchema: {
            milestoneId: z
              .uuid()
              .describe("Milestone id, from get_application"),
            title: z.string().min(1).max(200).optional(),
            status: z.enum(milestoneStatusEnum.enumValues).optional(),
            date: z.string().optional().describe("ISO date or date-time"),
            comment: z.string().max(5000).optional(),
          },
        },
        async ({ milestoneId, ...fields }) =>
          attempt(async () => {
            guardWrite(ctx);
            const result = await updateMilestone(
              ctx.userId,
              milestoneId,
              updateMilestoneSchema.parse(fields),
            );
            if (!result) throw new ApiError(404, "No such milestone", "NOT_FOUND");
            return result;
          }),
      );
    },
  },
  {
    name: "reopen_application",
    scope: "edit",
    register(server, ctx) {
      server.registerTool(
        "reopen_application",
        {
          title: "Reopen an archived application",
          description:
            "Bring an archived application back to the status it had before it was archived.",
          inputSchema: { applicationId: APPLICATION_ID },
        },
        async ({ applicationId }) =>
          attempt(async () => {
            guardWrite(ctx);
            return reopenApplication(ctx.userId, applicationId);
          }),
      );
    },
  },
  {
    name: "archive_application",
    scope: "full",
    register(server, ctx) {
      server.registerTool(
        "archive_application",
        {
          title: "Archive an application",
          description:
            "Take an application off the board. Soft: the row, its milestones and notes are kept, and reopen_application restores it exactly.",
          inputSchema: { applicationId: APPLICATION_ID },
        },
        async ({ applicationId }) =>
          attempt(async () => {
            guardWrite(ctx);
            const application = await softDeleteApplication(
              ctx.userId,
              applicationId,
            );
            if (!application) throw new ApiError(404, "No such application", "NOT_FOUND");
            return application;
          }),
      );
    },
  },
  {
    name: "delete_milestone",
    scope: "full",
    register(server, ctx) {
      server.registerTool(
        "delete_milestone",
        {
          title: "Delete a step",
          description:
            "Remove one step from a timeline for good. The remaining steps close the gap, and the status is re-derived from what is left. There is no undo. The legitimate use beyond a mistake: after an offer, the steps that never happened or were skipped are noise — clear them once the process is over.",
          inputSchema: {
            milestoneId: z
              .uuid()
              .describe("Milestone id, from get_application"),
          },
        },
        async ({ milestoneId }) =>
          attempt(async () => {
            guardWrite(ctx);
            const result = await deleteMilestone(ctx.userId, milestoneId);
            if (!result) throw new ApiError(404, "No such milestone", "NOT_FOUND");
            return result;
          }),
      );
    },
  },
  {
    name: "reset_timeline",
    scope: "full",
    register(server, ctx) {
      server.registerTool(
        "reset_timeline",
        {
          title: "Reset a timeline",
          description:
            "Send the process back to the application itself: the first step stays done and every step after it returns to pending with its date cleared. Cannot be undone.",
          inputSchema: { applicationId: APPLICATION_ID },
        },
        async ({ applicationId }) =>
          attempt(async () => {
            guardWrite(ctx);
            const result = await resetTimeline(ctx.userId, applicationId);
            if (!result) throw new ApiError(404, "No such application", "NOT_FOUND");
            return result;
          }),
      );
    },
  },
];

/** The tools a scope actually gets — the only place a scope is turned into capability. */
export function toolsForScope(scope: AgentScope): AgentTool[] {
  return TOOLS.filter((tool) => scopeIncludes(scope, tool.scope));
}

/**
 * The guide to Ghosted as a *product*, not as an API: what an application and a
 * milestone are, which status is derived and which is the user's call, and what
 * moves the silence clock. Tool descriptions say how to call a tool; this says
 * what the app means, which is what stops a plausible-but-wrong write.
 *
 * It is served twice on purpose — as the server's `instructions`, which a client
 * may surface before anything is called, and as `get_guide`, for clients that do
 * not show instructions at all. One constant, so the two cannot drift.
 */
export const GHOSTED_GUIDE = `Ghosted is the user's own job-application tracker: one account, its applications, and one timeline of milestones per application.

DATA MODEL
- An application: company, role, url (the job posting), companyWebsite (the employer's own site as a bare domain, e.g. stripe.com — it drives the company logo), contactName/contactEmail/contactPhone, notes, isFavorite, status, totalSteps, updatedAt. Ids are UUIDs, returned by list_applications.
- A milestone: one step of that application's timeline, ordered 0..n-1, with title, status (pending | done | skipped), date and comment. The first step is the application itself.

STATUS
- Stored statuses: applied, interviewing, offer, rejected, archived, ghosted.
- applied → interviewing → offer is derived from the timeline: any done step makes it interviewing, every step done makes it offer. rejected and archived are the user's terminal decisions and are never re-derived by a milestone edit.
- ghosted is two things at once: a status the user can set by hand, and a display overlay — an applied or interviewing application with no movement past the user's patience window (7, 10 or 14 days) is shown as ghosted. list_applications and get_application return displayStatus; report that, not the stored status, unless you are asked about the stored one.
- updatedAt is the silence clock. Status changes and timeline changes move it; descriptive edits (company, role, url, companyWebsite, contacts, notes) deliberately do not, so bookkeeping cannot fake progress.

THE TIMELINE IS EDITABLE, AND IT IS A GUESS UNTIL THE USER SAYS OTHERWISE
- A new application starts with five default steps: Application, HR Screen, Technical Interview, Test/Homework, Offer/Decision. That default is a starting point, not a record of what actually happened.
- When the hiring process is actually known — the posting or the email spells out the stages — make the timeline match it: keep "Application" first, rename the defaults to the stages the employer names, and add the ones it has and the defaults lack, in the order given. A process you were told should not sit as five guesses.
- Extend it when the user tells you about something that happened or is scheduled and the timeline has no step for it: a screening call, a task, an extra interview round. add_milestone appends by default; pass position to insert.
- Retitle a step when its label does not match what actually happened, and set date to the day it happened when the user gives one.
- Mark a step done as soon as it is done, and use skipped for a step that is not going to happen.
- When you have no information yet, leave the timeline alone: do not invent rounds, do not pre-fill dates, do not mark a step done because a process usually reaches it. A step that never happened is noise, and the silence clock runs on the user's activity, not on your guesses.
- Check the existing step titles before adding one: the same round twice is worse than a missing one, and only the user can say whether two similarly named steps are the same event.

OUTCOMES
- A rejection goes where it happened. Set the status to rejected, then write the detail — date, who sent it, what they said, the reason if there is one — as the comment of the step the process had reached: the latest step marked done, or the first step if none were. A rejected application with a bare status loses the one thing worth keeping.
- An offer closes the timeline. Set the status to offer, mark the offer step done, then tidy: the steps that never happened and the ones marked skipped are noise once the process is over, so delete them (needs full access). Say what you removed — a record should not shrink silently.
- Recording an outcome changes the status by hand, and that is the correct use of a manual status: the timeline cannot express "they said no", so you say it, in the status and in the comment.

WORKING
- Read before writing: list_applications to find the application, get_application for its timeline and milestone ids.
- Send only the fields you are changing; leaving a field out is how you leave it alone. Dates are ISO 8601 (2026-11-01 or a full timestamp).
- Marking a milestone done is how an application advances. Set status by hand only to correct something the timeline cannot express.
- archive_application is soft: the row, timeline and notes are kept, and reopen_application restores the exact status it had.
- reset_timeline keeps the first step done and returns every later step to pending with its date cleared.
- list_applications paginates: limit at most 100, default 20, and the response carries totalPages.
- Writes share the account's write budget (300 per hour by default). A rate-limit error means slow down, not retry in a loop.
- Never invent an id, a company or a milestone: use what list_applications and get_application returned.
- When the same finding can run more than once — a mailbox digest, an auto-applier, a retry after a timeout — use find_or_create_application instead of list-then-create: it matches the posting URL first (ignoring http vs https, www, a trailing slash, the fragment and tracking parameters such as utm_*), then company + role, and tells you whether it wrote anything. A second run must update, never duplicate. Always pass url when you have it; company + role alone is the weaker identity.
- A match is not a refusal, and it is not always an error. create_application checks before it writes: a live match (applied, interviewing, offer, ghosted) means the same application, so nothing is written and you get "created: false" with the row — update that one. A rejected or archived match is a reapplication the user may have done on purpose: tell them what you found, and only if they want the second row, call again with force: true. Never reach for force to get past an answer you did not like.

BOUNDARIES
- These tools reach applications and milestones only. There is no tool for the account itself — no email, password, session, export or deletion — so do not offer to change those.
- Archiving, deleting a milestone and resetting a timeline cannot be undone by you. Ask the user before using them unless they said to.
- These are the user's own records: keep edits small and named, and say what changed and why.`;

/** What the client shows its model before any tool is called. */
export function instructionsForScope(scope: AgentScope): string {
  return [
    `This Ghosted connection is ${SCOPE_LABELS[scope].toLowerCase()}: ${SCOPE_DESCRIPTIONS[scope]}`,
    GHOSTED_GUIDE,
  ].join("\n\n");
}

/** The MCP server for one connection: a token, its scope, and its user. */
export function createAgentServer(ctx: AgentContext): McpServer {
  const server = new McpServer(
    { name: "ghosted", version: packageJson.version },
    { instructions: instructionsForScope(ctx.scope) },
  );
  for (const tool of toolsForScope(ctx.scope)) tool.register(server, ctx);
  return server;
}
